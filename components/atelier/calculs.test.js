import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculerTempsPlanifieParMecanicien, estRendezVousExclu } from './calculs.js'

// Les sélecteurs par étape que ce fichier couvrait sont partis avec les
// sections qu'ils alimentaient : leur couverture a été reportée, cas par cas,
// dans `groupes.test.js` — regroupement, exclusions, frontière de journée,
// deux visites d'un même véhicule. Rien n'a été perdu en route.

// Mercredi 10/09/2026 12:00 Europe/Paris (CEST, UTC+2) = 10:00 UTC.
const MAINTENANT = new Date('2026-09-10T10:00:00Z')

function rdv(overrides) {
  return {
    id: 'rdv-defaut',
    statut: 'Confirmé',
    client: 'Client Test',
    vehicule: 'Peugeot 308',
    immatriculation: 'AA-000-BB',
    vehicule_id: 'veh-1',
    prestation: 'Vidange',
    debut: '09:00',
    fin: '10:00',
    date_debut: '2026-09-10T07:00:00Z',
    date_fin: '2026-09-10T08:00:00Z',
    mecanicien_id: null,
    statut_atelier: undefined,
    ...overrides,
  }
}

test('annulé, absent et terminé sont reconnus comme hors atelier', () => {
  for (const statut of ['Annulé', 'Absent', 'Terminé']) {
    assert.equal(estRendezVousExclu(rdv({ statut })), true)
  }
  assert.equal(estRendezVousExclu(rdv({ statut: 'Confirmé' })), false)
  assert.equal(estRendezVousExclu(undefined), false)
})

test('le temps planifié ignore les créneaux à date invalide sans planter', () => {
  const mecaniciens = [{ id: 'mec-1', nom: 'Julien' }]
  const valide = rdv({ id: 'rdv-valide', mecanicien_id: 'mec-1', date_debut: '2026-09-10T07:00:00Z', date_fin: '2026-09-10T08:00:00Z' })
  const dateFinInvalide = rdv({ id: 'rdv-fin-invalide', mecanicien_id: 'mec-1', date_debut: '2026-09-10T09:00:00Z', date_fin: 'pas-une-date' })
  const dateFinManquante = rdv({ id: 'rdv-fin-manquante', mecanicien_id: 'mec-1', date_debut: '2026-09-10T10:00:00Z', date_fin: null })
  const finAvantDebut = rdv({ id: 'rdv-fin-avant-debut', mecanicien_id: 'mec-1', date_debut: '2026-09-10T12:00:00Z', date_fin: '2026-09-10T11:00:00Z' })

  const resultat = calculerTempsPlanifieParMecanicien(
    [valide, dateFinInvalide, dateFinManquante, finAvantDebut],
    mecaniciens,
    MAINTENANT
  )
  const julien = resultat.find((m) => m.mecanicienId === 'mec-1')
  // Les 4 rendez-vous du jour comptent dans le nombre de RDV...
  assert.equal(julien.nombreRdv, 4)
  // ...mais seul le créneau valide (60 min) contribue à la somme.
  assert.equal(julien.minutesPlanifiees, 60)
})

test('le temps planifié regroupe les rendez-vous sans mécanicien à part, sans pourcentage', () => {
  const mecaniciens = [{ id: 'mec-1', nom: 'Julien' }]
  const sansMecanicien = rdv({ id: 'rdv-sans-mecanicien', mecanicien_id: null, date_debut: '2026-09-10T07:00:00Z', date_fin: '2026-09-10T07:30:00Z' })
  const resultat = calculerTempsPlanifieParMecanicien([sansMecanicien], mecaniciens, MAINTENANT)
  assert.deepEqual(
    resultat.map((m) => ({ nom: m.nom, nombreRdv: m.nombreRdv, minutesPlanifiees: m.minutesPlanifiees })),
    [
      { nom: 'Julien', nombreRdv: 0, minutesPlanifiees: 0 },
      { nom: 'Non assigné', nombreRdv: 1, minutesPlanifiees: 30 },
    ]
  )
  for (const m of resultat) {
    assert.equal('pourcentage' in m, false)
    assert.equal('capacite' in m, false)
  }
})

test('le temps planifié ne compte que la journée en cours, en heure de Paris', () => {
  const mecaniciens = [{ id: 'mec-1', nom: 'Julien' }]
  // 2026-09-10T22:30:00Z = 2026-09-11T00:30 à Paris : jour suivant.
  const demain = rdv({ id: 'demain', mecanicien_id: 'mec-1', date_debut: '2026-09-10T22:30:00Z', date_fin: '2026-09-10T23:30:00Z' })
  const resultat = calculerTempsPlanifieParMecanicien([demain], mecaniciens, MAINTENANT)
  assert.equal(resultat.find((m) => m.mecanicienId === 'mec-1').nombreRdv, 0)
})
