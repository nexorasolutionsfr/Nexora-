import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resumeJournee } from './resumeJournee.js'

// `toLocaleString("fr-FR")` sépare les milliers par une espace insécable
// étroite (U+202F), pas par une espace ordinaire — et le caractère exact
// dépend de la version d'ICU embarquée dans Node. Comparer dessus rendrait ces
// tests cassants sans rien prouver d'utile : on normalise.
const normaliser = (t) => t.replace(/[\u00A0\u202F\u2009]/g, ' ')

test('une journée calme le dit en une phrase', () => {
  const r = resumeJournee({ rdvAujourdhui: 3, vehiculesEngages: 1 })
  assert.equal(r.texte, "3 voitures attendues aujourd'hui, 1 à l'atelier — rien qui bloque.")
  assert.equal(r.ton, 'calme')
})

test('le singulier est respecté partout', () => {
  assert.equal(
    resumeJournee({ rdvAujourdhui: 1, vehiculesEngages: 1 }).texte,
    "1 voiture attendue aujourd'hui, 1 à l'atelier — rien qui bloque.",
  )
  assert.equal(
    resumeJournee({ rdvAujourdhui: 2, decisionsEnAttente: 1 }).texte,
    "2 voitures attendues aujourd'hui — 1 décision vous attend.",
  )
})

test('un jour de fermeture, la phrase ne redit pas ce que la pastille affiche', () => {
  // La pastille de l'en-tête annonce déjà « Fermé aujourd'hui », trois
  // centimètres plus haut. Le répéter serait une fois de trop — et dire
  // « zéro rendez-vous » ferait passer une fermeture pour un creux d'activité.
  const r = resumeJournee({ ferme: true, rdvAujourdhui: 0 })
  assert.equal(r.texte, 'Rien qui bloque.')
  assert.ok(!/ferm/i.test(r.texte))
  assert.ok(!r.texte.startsWith('—'), 'une phrase ne commence pas par un tiret')
})

test('une voiture encore là un jour de fermeture est mentionnée', () => {
  const r = resumeJournee({ ferme: true, vehiculesEngages: 2 })
  assert.equal(r.texte, "2 à l'atelier — rien qui bloque.")
})

test('fermé avec une décision en attente : la majuscule est mise', () => {
  const r = resumeJournee({ ferme: true, decisionsEnAttente: 1 })
  assert.equal(r.texte, '1 décision vous attend.')
  assert.equal(r.ton, 'attention')
})

test('une seule alerte à la fois, la décision passe avant l’argent', () => {
  // Deux alertes dans la même phrase, et aucune des deux n'est lue.
  const r = resumeJournee({ rdvAujourdhui: 2, decisionsEnAttente: 3, montantRisque: 900 })
  assert.equal(r.texte, "2 voitures attendues aujourd'hui — 3 décisions vous attendent.")
  assert.ok(!r.texte.includes('900'))
  assert.equal(r.ton, 'attention')
})

test('l’argent à relancer passe quand rien n’attend de décision', () => {
  const r = resumeJournee({ rdvAujourdhui: 0, montantRisque: 1250.4 })
  assert.equal(normaliser(r.texte), "Aucun rendez-vous aujourd'hui — 1 250 € à relancer.")
  assert.equal(r.ton, 'attention')
})

test('les centimes ne survivent pas à un coup d’œil', () => {
  assert.ok(resumeJournee({ montantRisque: 174.49 }).texte.includes('174 €'))
  assert.ok(resumeJournee({ montantRisque: 174.5 }).texte.includes('175 €'))
})

test('un garage tout neuf obtient une phrase correcte, pas un trou', () => {
  const r = resumeJournee()
  assert.equal(r.texte, "Aucun rendez-vous aujourd'hui — rien qui bloque.")
  assert.equal(r.ton, 'calme')
})

test('rien n’est jamais estimé : zéro voiture ne devient pas « calme journée »', () => {
  // La phrase ne doit contenir aucun adjectif d'appréciation : le garage juge,
  // Nexora compte.
  for (const cas of [{}, { rdvAujourdhui: 9, vehiculesEngages: 4 }, { decisionsEnAttente: 2 }]) {
    const t = resumeJournee(cas).texte
    assert.ok(!/calme|chargée|tranquille|belle|bonne/i.test(t), t)
  }
})
