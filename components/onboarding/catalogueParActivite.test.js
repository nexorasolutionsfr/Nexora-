import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogueInitial, PAR_ACTIVITE, SOCLE_COMMUN } from './catalogueParActivite.js'
import { CLES_PROFIL_ACTIVITE } from './profilsActivite.js'

test('chaque activité du vocabulaire a son catalogue', () => {
  // Une activité proposée à l'écran sans prestations associées laisserait le
  // garage devant une liste vide, ce que ce lot est censé empêcher.
  for (const cle of CLES_PROFIL_ACTIVITE) {
    assert.ok(PAR_ACTIVITE[cle], `activité sans catalogue : ${cle}`)
    assert.ok(PAR_ACTIVITE[cle].length >= 3, `catalogue trop maigre : ${cle}`)
  }
})

test('le catalogue ne référence aucune activité inconnue', () => {
  for (const cle of Object.keys(PAR_ACTIVITE)) {
    assert.ok(CLES_PROFIL_ACTIVITE.includes(cle), `activité hors vocabulaire : ${cle}`)
  }
})

test('un profil vide ne rend que le socle commun', () => {
  const c = catalogueInitial([])
  assert.equal(c.length, SOCLE_COMMUN.length)
})

test('le socle commun est présent quelle que soit l activité', () => {
  const c = catalogueInitial(['pneus'])
  assert.ok(c.some((p) => p.nom === 'Diagnostic / prise en charge'))
})

test('les activités choisies apportent leurs prestations', () => {
  const c = catalogueInitial(['pneus'])
  const noms = c.map((p) => p.nom)
  assert.ok(noms.includes('Géométrie / parallélisme'))
  assert.ok(!noms.includes('Remorquage'), 'aucune prestation d une activité non choisie')
})

test('aucun doublon de nom, même en croisant des activités', () => {
  const c = catalogueInitial(CLES_PROFIL_ACTIVITE)
  const noms = c.map((p) => p.nom.toLowerCase())
  assert.equal(new Set(noms).size, noms.length)
})

test('le catalogue ne dépend pas de l ordre de sélection', () => {
  // Deux garages au même profil doivent obtenir exactement le même catalogue,
  // sinon deux comptes identiques divergent dès la première minute.
  const a = catalogueInitial(['pneus', 'mecanique', 'carrosserie'])
  const b = catalogueInitial(['carrosserie', 'pneus', 'mecanique'])
  assert.deepEqual(a, b)
})

test('une activité inconnue est ignorée sans casser', () => {
  const c = catalogueInitial(['pneus', 'plomberie'])
  assert.ok(c.some((p) => p.nom === 'Équilibrage'))
})

test('chaque prestation est directement insérable en base', () => {
  for (const p of catalogueInitial(CLES_PROFIL_ACTIVITE)) {
    assert.equal(typeof p.nom, 'string')
    assert.ok(p.nom.trim().length > 0)
    assert.equal(typeof p.categorie, 'string')
    // duree_minutes est NOT NULL sans valeur par défaut côté base : une durée
    // manquante ferait échouer l'insertion silencieusement, juste après la
    // création du garage.
    assert.equal(Number.isInteger(p.duree_minutes), true, `durée non entière : ${p.nom}`)
    assert.ok(p.duree_minutes > 0 && p.duree_minutes <= 480, `durée invraisemblable : ${p.nom}`)
    assert.deepEqual(Object.keys(p).sort(), ['categorie', 'duree_minutes', 'nom'])
  }
})

test('le catalogue complet reste d une taille raisonnable', () => {
  // Un garage qui coche tout ne doit pas se retrouver avec un catalogue
  // ingérable qu'il devra élaguer à la main.
  const c = catalogueInitial(CLES_PROFIL_ACTIVITE)
  assert.ok(c.length <= 45, `catalogue trop long : ${c.length}`)
  assert.ok(c.length >= 30, `catalogue étonnamment court : ${c.length}`)
})
