import assert from 'node:assert/strict'
import { test } from 'node:test'
import { etapesMiseEnRoute, etatMiseEnRoute, horairesRenseignes } from './miseEnRoute.js'

const VIDE = { garageData: {}, mecaniciens: [], clients: [], rendezVous: [], devis: [] }
const HORAIRES = { horaires: { '1': [['08:00', '12:00']] } }
const TOUTES = ['clients', 'premier_devis', 'horaires', 'mecaniciens', 'premier_rdv']

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
  assert.equal(etat.total, 5)
  assert.equal(etat.restantes.length, 5)
  assert.equal(etat.visible, true)
})

test('l’état est déduit des données, jamais stocké', () => {
  const etat = etatMiseEnRoute({ ...VIDE, garageData: HORAIRES, mecaniciens: [{ id: 1 }] })
  assert.equal(etat.faites, 2)
  assert.deepEqual(etat.restantes.map((e) => e.cle), ['clients', 'premier_devis', 'premier_rdv'])
  // Si le garage supprime ses mécaniciens, l'étape redevient à faire : la
  // liste dit toujours la vérité plutôt qu'un drapeau figé.
  const apres = etatMiseEnRoute({ ...VIDE, garageData: HORAIRES })
  assert.ok(apres.restantes.some((e) => e.cle === 'mecaniciens'))
})

test('un devis créé coche l’étape du premier devis', () => {
  const etat = etatMiseEnRoute({ ...VIDE, clients: [{}], devis: [{}] })
  assert.ok(!etat.restantes.some((e) => e.cle === 'premier_devis'))
  assert.equal(etat.faites, 2)
})

test('une étape passée disparaît sans être comptée comme faite', () => {
  const etat = etatMiseEnRoute(VIDE, ['mecaniciens'])
  assert.equal(etat.faites, 0, 'passer n’est pas faire')
  assert.ok(!etat.restantes.some((e) => e.cle === 'mecaniciens'))
  assert.equal(etat.restantes.length, 4)
})

test('la liste s’efface quand tout est fait ou passé', () => {
  assert.equal(etatMiseEnRoute(VIDE, TOUTES).visible, false)
  assert.equal(etatMiseEnRoute({
    garageData: HORAIRES, mecaniciens: [{}], clients: [{}], rendezVous: [{}], devis: [{}],
  }).visible, false)
})

test('chaque étape sait où elle emmène', () => {
  for (const e of etapesMiseEnRoute(VIDE)) {
    assert.ok(e.vue, `${e.cle} sans destination`)
    assert.ok(e.titre && e.pourquoi && e.action, `${e.cle} incomplète`)
  }
})

// Recette du 2026-09-11 : la première ligne guidée menait à une reprise CSV,
// impasse pour un garage sans fichier. La première action utile est de créer
// un client, à la main, en ouvrant directement la fenêtre de création.
test('le premier client vient en premier, et ouvre la création à la main', () => {
  const [premiere, deuxieme] = etapesMiseEnRoute(VIDE)
  assert.equal(premiere.cle, 'clients')
  assert.equal(premiere.vue, 'clients')
  assert.equal(premiere.creation, 'client')
  assert.notEqual(premiere.onglet, 'import')
  assert.equal(deuxieme.cle, 'premier_devis')
  assert.equal(deuxieme.creation, 'devis')
})
