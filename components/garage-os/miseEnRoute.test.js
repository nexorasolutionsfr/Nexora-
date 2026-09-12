import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GROUPE_CONFIGURER,
  GROUPE_UTILISER,
  etapesMiseEnRoute,
  etatMiseEnRoute,
  groupesRestants,
  horairesRenseignes,
} from './miseEnRoute.js'

const VIDE = { garageData: {}, mecaniciens: [], clients: [], rendezVous: [], devis: [] }
const HORAIRES = { horaires: { '1': [['08:00', '12:00']] } }
const TOUTES = ['clients', 'premier_rdv', 'premier_devis', 'horaires', 'mecaniciens']

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
  assert.deepEqual(etat.restantes.map((e) => e.cle), ['clients', 'premier_rdv', 'premier_devis'])
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
  const [premiere, deuxieme, troisieme] = etapesMiseEnRoute(VIDE)
  assert.equal(premiere.cle, 'clients')
  assert.equal(premiere.vue, 'clients')
  assert.equal(premiere.creation, 'client')
  assert.notEqual(premiere.onglet, 'import')
  // Revue du 2026-09-12 : l'ordre suit le métier — un client, sa voiture
  // attendue, puis le chiffrage. Le devis passait avant le rendez-vous.
  assert.equal(deuxieme.cle, 'premier_rdv')
  assert.equal(troisieme.cle, 'premier_devis')
  assert.equal(troisieme.creation, 'devis')
})

// Revue du 2026-09-12 : la liste proposait « horaires » et « équipe » — donc
// les Paramètres — à un compte accueil qui n'y a pas droit. Une étape qui
// mène à un refus n'a rien à faire dans une mise en route.
test('le compte accueil ne se voit proposer que ce qu’il peut ouvrir', () => {
  const etapes = etapesMiseEnRoute({ ...VIDE, role: 'accueil' })
  assert.deepEqual(etapes.map((e) => e.cle), ['clients', 'premier_rdv', 'premier_devis'])
  assert.ok(!etapes.some((e) => e.vue === 'parametres'), 'aucune étape vers les Paramètres')
})

test('le dirigeant garde les cinq étapes, et l’absence de rôle ne filtre rien', () => {
  assert.equal(etapesMiseEnRoute({ ...VIDE, role: 'dirigeant' }).length, 5)
  assert.equal(etapesMiseEnRoute(VIDE).length, 5)
  const etat = etatMiseEnRoute({ ...VIDE, role: 'accueil' })
  assert.equal(etat.total, 3, 'le compteur suit ce qui est réellement proposé')
})

// Revue du 2026-09-12 (soir) : cinq étapes à plat mettaient le paramétrage au
// même niveau que ce qui fait gagner du temps. Deux groupes, et les actions
// métier d'abord.
test('les étapes se répartissent en deux groupes, le métier en tête', () => {
  const etapes = etapesMiseEnRoute(VIDE)
  const metier = etapes.filter((e) => e.groupe === GROUPE_UTILISER).map((e) => e.cle)
  const config = etapes.filter((e) => e.groupe === GROUPE_CONFIGURER).map((e) => e.cle)
  assert.deepEqual(metier, ['clients', 'premier_rdv', 'premier_devis'])
  assert.deepEqual(config, ['horaires', 'mecaniciens'])
  const groupes = groupesRestants(etatMiseEnRoute(VIDE).restantes)
  assert.deepEqual(groupes.map((g) => g.cle), [GROUPE_UTILISER, GROUPE_CONFIGURER])
  assert.equal(groupes[0].titre, 'Commencer à utiliser Nexora')
  assert.equal(groupes[1].titre, 'Configurer mon garage')
})

test('un groupe sans étape restante n’est pas rendu', () => {
  const etat = etatMiseEnRoute({ ...VIDE, garageData: HORAIRES, mecaniciens: [{}] })
  const groupes = groupesRestants(etat.restantes)
  assert.deepEqual(groupes.map((g) => g.cle), [GROUPE_UTILISER])
  assert.deepEqual(groupesRestants([]), [])
})

// « Passer » ne disait pas ce qu'il ferait, et « Ajouter » ne disait pas quoi.
test('chaque action nomme son objet, et seule la configuration se reporte', () => {
  for (const e of etapesMiseEnRoute(VIDE)) {
    assert.ok(e.action.split(' ').length >= 2, `${e.cle} : action trop vague (« ${e.action} »)`)
    assert.doesNotMatch(e.action, /^(Ajouter|Créer|Renseigner|Ouvrir)$/, `${e.cle} : verbe sans objet`)
    assert.equal(e.reportable, e.groupe === GROUPE_CONFIGURER, `${e.cle} : report mal réglé`)
  }
  const actions = etapesMiseEnRoute(VIDE).map((e) => e.action)
  assert.ok(actions.includes('Ajouter un client'))
  assert.ok(actions.includes('Configurer les horaires'))
})
