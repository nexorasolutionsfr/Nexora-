import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONTROLE_STANDARD,
  compterASignaler,
  pointsAInserer,
  resumeControle,
} from './controleStandard.js'

test('le contrôle standard couvre les quatre catégories utiles', () => {
  const cats = new Set(CONTROLE_STANDARD.map((p) => p.categorie))
  assert.deepEqual([...cats].sort(), ['exterieur', 'objets', 'pneus', 'voyants'])
  assert.ok(CONTROLE_STANDARD.length >= 15, 'un tour de voiture, pas trois cases')
})

test('aucun doublon dans le modèle lui-même', () => {
  const clefs = CONTROLE_STANDARD.map((p) => `${p.categorie}::${p.libelle.toLowerCase()}`)
  assert.equal(new Set(clefs).size, clefs.length)
})

test('sur une inspection vide, tout est posé au vert', () => {
  const lignes = pointsAInserer([])
  assert.equal(lignes.length, CONTROLE_STANDARD.length)
  assert.ok(lignes.every((l) => l.etat === 'ok'))
})

test('relancer l’action ne crée pas de doublons, elle complète', () => {
  const existants = [
    { categorie: 'pneus', libelle: 'Avant gauche', etat: 'dommage' },
    { categorie: 'exterieur', libelle: 'Pare-brise', etat: 'ok' },
  ]
  const lignes = pointsAInserer(existants)
  assert.equal(lignes.length, CONTROLE_STANDARD.length - 2)
  assert.ok(!lignes.some((l) => l.categorie === 'pneus' && l.libelle === 'Avant gauche'))
  // Et surtout : le dommage déjà saisi n'est pas écrasé, puisqu'on ne le
  // réinsère pas.
})

test('la casse et les espaces ne fabriquent pas de faux doublons', () => {
  const lignes = pointsAInserer([{ categorie: 'exterieur', libelle: '  pare-brise ' }])
  assert.ok(!lignes.some((l) => l.libelle === 'Pare-brise'))
})

test('un point libre ajouté par le garage n’empêche rien', () => {
  const lignes = pointsAInserer([{ categorie: 'autre', libelle: 'Attelage' }])
  assert.equal(lignes.length, CONTROLE_STANDARD.length)
})

test('on compte ce qui mérite attention, jamais les conformes', () => {
  const points = [
    { categorie: 'pneus', etat: 'ok' },
    { categorie: 'pneus', etat: 'a_surveiller' },
    { categorie: 'voyants', etat: 'dommage' },
    { categorie: 'voyants', etat: 'a_valider_client' },
  ]
  assert.equal(compterASignaler(points), 3)
  assert.equal(compterASignaler(points, 'pneus'), 1)
  assert.equal(compterASignaler(points, 'exterieur'), 0)
})

test('le résumé dit ce qu’on dirait à voix haute', () => {
  const points = [
    { etat: 'ok' }, { etat: 'ok' },
    { etat: 'dommage' },
    { etat: 'a_valider_client', soumis_client: true },
  ]
  assert.deepEqual(resumeControle(points), { total: 4, aSignaler: 2, conformes: 2, soumis: 1 })
})

test('un contrôle vide ne ment pas sur son contenu', () => {
  assert.deepEqual(resumeControle([]), { total: 0, aSignaler: 0, conformes: 0, soumis: 0 })
})
