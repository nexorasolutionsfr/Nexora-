import assert from 'node:assert/strict'
import { test } from 'node:test'
import { etapesMiseEnRoute, etatMiseEnRoute, horairesRenseignes } from './miseEnRoute.js'

const VIDE = { garageData: {}, mecaniciens: [], clients: [], rendezVous: [] }

test('des horaires absents, vides ou mal formés ne comptent pas comme renseignés', () => {
  assert.equal(horairesRenseignes(null), false)
  assert.equal(horairesRenseignes({}), false)
  assert.equal(horairesRenseignes({ horaires: {} }), false)
  assert.equal(horairesRenseignes({ horaires: { '1': [] } }), false)
  assert.equal(horairesRenseignes({ horaires: { '1': [['', '']] } }), false)
  // Une plage inversée est une saisie en cours, pas un horaire.
  assert.equal(horairesRenseignes({ horaires: { '1': [['18:00', '08:00']] } }), false)
})

test('une seule plage valide suffit', () => {
  assert.equal(horairesRenseignes({ horaires: { '1': [['08:30', '12:00']] } }), true)
})

test('un garage neuf a tout à faire, et la liste s’affiche', () => {
  const etat = etatMiseEnRoute(VIDE)
  assert.equal(etat.faites, 0)
  assert.equal(etat.total, 4)
  assert.equal(etat.restantes.length, 4)
  assert.equal(etat.visible, true)
})

test('l’état est déduit des données, jamais stocké', () => {
  const etat = etatMiseEnRoute({
    garageData: { horaires: { '1': [['08:00', '12:00']] } },
    mecaniciens: [{ id: 1 }],
    clients: [],
    rendezVous: [],
  })
  assert.equal(etat.faites, 2)
  assert.deepEqual(etat.restantes.map((e) => e.cle), ['clients', 'premier_rdv'])
  // Si le garage supprime ses mécaniciens, l'étape redevient à faire : la
  // liste dit toujours la vérité plutôt qu'un drapeau figé.
  const apres = etatMiseEnRoute({ ...VIDE, garageData: { horaires: { '1': [['08:00', '12:00']] } } })
  assert.ok(apres.restantes.some((e) => e.cle === 'mecaniciens'))
})

test('une étape passée disparaît sans être comptée comme faite', () => {
  const etat = etatMiseEnRoute(VIDE, ['mecaniciens'])
  assert.equal(etat.faites, 0, 'passer n’est pas faire')
  assert.ok(!etat.restantes.some((e) => e.cle === 'mecaniciens'))
  assert.equal(etat.restantes.length, 3)
})

test('la liste s’efface quand tout est fait ou passé', () => {
  assert.equal(etatMiseEnRoute(VIDE, ['horaires', 'mecaniciens', 'clients', 'premier_rdv']).visible, false)
  assert.equal(etatMiseEnRoute({
    garageData: { horaires: { '1': [['08:00', '12:00']] } },
    mecaniciens: [{}], clients: [{}], rendezVous: [{}],
  }).visible, false)
})

test('chaque étape sait où elle emmène', () => {
  for (const e of etapesMiseEnRoute(VIDE)) {
    assert.ok(e.vue, `${e.cle} sans destination`)
    assert.ok(e.titre && e.pourquoi && e.action, `${e.cle} incomplète`)
  }
})

test('les horaires viennent en premier', () => {
  // Sans eux, l'agenda propose des créneaux un jour de fermeture : c'est le
  // réglage qui rend le reste juste.
  assert.equal(etapesMiseEnRoute(VIDE)[0].cle, 'horaires')
})
