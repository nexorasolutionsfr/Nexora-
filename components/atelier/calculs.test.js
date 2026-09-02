import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculerCompteurs,
  calculerTempsPlanifieParMecanicien,
  determinerAlertes,
  regrouperParEtape,
  selectionnerAAccueillir,
  selectionnerDansAtelier,
  selectionnerPretsARestituer,
  selectionnerRestitutionsAujourdhui,
} from './calculs.js'

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

test("un véhicule entré la veille et toujours en intervention reste visible dans l'atelier", () => {
  const veille = rdv({ id: 'rdv-veille-intervention', statut_atelier: 'intervention', date_debut: '2026-09-09T07:00:00Z', date_fin: '2026-09-09T08:00:00Z' })
  const dansAtelier = selectionnerDansAtelier([veille])
  assert.deepEqual(dansAtelier.map((r) => r.id), ['rdv-veille-intervention'])
  const groupes = regrouperParEtape([veille])
  const colonneIntervention = groupes.find((g) => g.key === 'intervention')
  assert.deepEqual(colonneIntervention.rendezVous.map((r) => r.id), ['rdv-veille-intervention'])
})

test('un véhicule prêt depuis la veille reste visible tant que non restitué', () => {
  const pretVeille = rdv({ id: 'rdv-pret-veille', statut_atelier: 'pret', date_debut: '2026-09-09T07:00:00Z', date_fin: '2026-09-09T08:00:00Z' })
  assert.deepEqual(selectionnerDansAtelier([pretVeille]).map((r) => r.id), ['rdv-pret-veille'])
  assert.deepEqual(selectionnerPretsARestituer([pretVeille]).map((r) => r.id), ['rdv-pret-veille'])
})

test("un rendez-vous ancien sans statut_atelier n'est jamais réintroduit", () => {
  const ancienSansEtape = rdv({ id: 'rdv-ancien-sans-etape', statut_atelier: undefined, date_debut: '2026-08-20T07:00:00Z' })
  assert.deepEqual(selectionnerAAccueillir([ancienSansEtape], MAINTENANT), [])
  assert.deepEqual(selectionnerDansAtelier([ancienSansEtape]), [])
  assert.deepEqual(selectionnerPretsARestituer([ancienSansEtape]), [])
})

test('annulé, absent et terminé sont exclus partout, quelle que soit leur étape atelier', () => {
  const cas = [
    rdv({ id: 'rdv-annule', statut: 'Annulé', statut_atelier: 'a_venir', date_debut: '2026-09-10T07:00:00Z' }),
    rdv({ id: 'rdv-absent', statut: 'Absent', statut_atelier: 'depose' }),
    rdv({ id: 'rdv-termine', statut: 'Terminé', statut_atelier: 'pret' }),
    rdv({ id: 'rdv-termine-restitue', statut: 'Terminé', statut_atelier: 'restitue', date_debut: '2026-09-10T07:00:00Z' }),
  ]
  assert.deepEqual(selectionnerAAccueillir(cas, MAINTENANT), [])
  assert.deepEqual(selectionnerDansAtelier(cas), [])
  assert.deepEqual(selectionnerPretsARestituer(cas), [])
  assert.deepEqual(selectionnerRestitutionsAujourdhui(cas, MAINTENANT), [])
  const compteurs = calculerCompteurs(cas, MAINTENANT)
  assert.deepEqual(compteurs, { aAccueillir: 0, dansAtelier: 0, bloques: 0, prets: 0 })
  const temps = calculerTempsPlanifieParMecanicien(cas, [], MAINTENANT)
  assert.deepEqual(temps, [])
})

test("restitution du jour affichée, ancienne restitution non affichée", () => {
  const restitueAujourdhui = rdv({ id: 'rdv-restitue-jour', statut_atelier: 'restitue', date_debut: '2026-09-10T07:00:00Z' })
  const restitueHier = rdv({ id: 'rdv-restitue-hier', statut_atelier: 'restitue', date_debut: '2026-09-05T07:00:00Z' })
  const resultat = selectionnerRestitutionsAujourdhui([restitueAujourdhui, restitueHier], MAINTENANT)
  assert.deepEqual(resultat.map((r) => r.id), ['rdv-restitue-jour'])
})

test('deux rendez-vous du même véhicule produisent deux cartes distinctes', () => {
  const rdv1 = rdv({ id: 'rdv-vehicule-x-1', vehicule_id: 'veh-x', statut_atelier: 'depose' })
  const rdv2 = rdv({ id: 'rdv-vehicule-x-2', vehicule_id: 'veh-x', statut_atelier: 'diagnostic' })
  const dansAtelier = selectionnerDansAtelier([rdv1, rdv2])
  assert.equal(dansAtelier.length, 2)
  assert.deepEqual(dansAtelier.map((r) => r.id).sort(), ['rdv-vehicule-x-1', 'rdv-vehicule-x-2'])
})

test('frontière de journée calculée en Europe/Paris, pas en UTC', () => {
  // 2026-09-10T22:30:00Z = 2026-09-11T00:30 CEST : jour suivant à Paris.
  const apresMinuitParis = rdv({ id: 'rdv-apres-minuit-paris', statut_atelier: 'a_venir', date_debut: '2026-09-10T22:30:00Z' })
  assert.deepEqual(selectionnerAAccueillir([apresMinuitParis], MAINTENANT), [])

  // 2026-09-09T23:15:00Z = 2026-09-10T01:15 CEST : même jour que MAINTENANT à Paris.
  const memeJourParisMalgreVeilleUTC = rdv({ id: 'rdv-meme-jour-paris', statut_atelier: 'a_venir', date_debut: '2026-09-09T23:15:00Z' })
  assert.deepEqual(
    selectionnerAAccueillir([memeJourParisMalgreVeilleUTC], MAINTENANT).map((r) => r.id),
    ['rdv-meme-jour-paris']
  )
})

// Créneau futur + mécanicien assigné : isole l'alerte testée des deux
// autres (sinon "Heure prévue dépassée"/"Non assigné" se déclencheraient
// aussi avec les valeurs par défaut de rdv()).
const DANS_LES_TEMPS_ASSIGNE = { mecanicien_id: 'mec-1', date_fin: '2026-09-10T11:00:00Z' }

test('alerte "Attente client" posée uniquement sur les rendez-vous en attente client', () => {
  assert.deepEqual(determinerAlertes(rdv({ statut_atelier: 'attente_client', ...DANS_LES_TEMPS_ASSIGNE }), MAINTENANT), ['Attente client'])
  assert.deepEqual(determinerAlertes(rdv({ statut_atelier: 'depose', ...DANS_LES_TEMPS_ASSIGNE }), MAINTENANT), [])
})

test('alerte "Attente pièce" posée uniquement sur les rendez-vous en attente pièce', () => {
  assert.deepEqual(determinerAlertes(rdv({ statut_atelier: 'attente_piece', ...DANS_LES_TEMPS_ASSIGNE }), MAINTENANT), ['Attente pièce'])
})

test("alerte \"Heure prévue dépassée\" quand la fin de créneau est passée sur une étape en cours", () => {
  const enRetard = rdv({ statut_atelier: 'intervention', mecanicien_id: 'mec-1', date_fin: '2026-09-10T09:00:00Z' })
  assert.deepEqual(determinerAlertes(enRetard, MAINTENANT), ['Heure prévue dépassée'])

  const dansLesTemps = rdv({ statut_atelier: 'intervention', mecanicien_id: 'mec-1', date_fin: '2026-09-10T11:00:00Z' })
  assert.deepEqual(determinerAlertes(dansLesTemps, MAINTENANT), [])

  // Un véhicule "prêt" n'est jamais considéré en retard.
  const pretDateFinPassee = rdv({ statut_atelier: 'pret', mecanicien_id: 'mec-1', date_fin: '2026-09-10T09:00:00Z' })
  assert.deepEqual(determinerAlertes(pretDateFinPassee, MAINTENANT), [])
})

test('alerte "Non assigné" posée uniquement sur une étape en cours sans mécanicien', () => {
  const sansMecanicien = rdv({ statut_atelier: 'diagnostic', mecanicien_id: null, date_fin: '2026-09-10T11:00:00Z' })
  assert.deepEqual(determinerAlertes(sansMecanicien, MAINTENANT), ['Non assigné'])

  const avecMecanicien = rdv({ statut_atelier: 'diagnostic', mecanicien_id: 'mec-1', date_fin: '2026-09-10T11:00:00Z' })
  assert.deepEqual(determinerAlertes(avecMecanicien, MAINTENANT), [])

  // "a_venir" n'est jamais marqué "non assigné" (pas encore une étape en cours).
  const aVenirSansMecanicien = rdv({ statut_atelier: 'a_venir', mecanicien_id: null })
  assert.deepEqual(determinerAlertes(aVenirSansMecanicien, MAINTENANT), [])
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

test('les compteurs distinguent bloqués (attente client + pièce) et prêts', () => {
  const cas = [
    rdv({ id: 'a', statut_atelier: 'a_venir', date_debut: '2026-09-10T07:00:00Z' }),
    rdv({ id: 'b', statut_atelier: 'depose' }),
    rdv({ id: 'c', statut_atelier: 'attente_client' }),
    rdv({ id: 'd', statut_atelier: 'attente_piece' }),
    rdv({ id: 'e', statut_atelier: 'pret' }),
  ]
  assert.deepEqual(calculerCompteurs(cas, MAINTENANT), { aAccueillir: 1, dansAtelier: 4, bloques: 2, prets: 1 })
})
