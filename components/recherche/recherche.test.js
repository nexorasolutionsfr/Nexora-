// Retrouver une voiture — les cas du comptoir.
//
// Exécution : node --test components/recherche/recherche.test.js

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  libelleCorrespondance,
  libelleVehicule,
  normaliserPlaque,
  normaliserTelephone,
  normaliserTexte,
  rechercherVehicules,
} from './recherche.js'

const CLIENTS = [
  { id: 'c1', nom: 'Élodie Ngô', telephone: '+33 6 45 67 89 01' },
  { id: 'c2', nom: 'Jean-Baptiste de La Rochefoucauld-Montmorency', telephone: '06 12 34 56 78' },
  { id: 'c3', nom: 'Ahmed Benali', telephone: '06.34.56.78.90' },
  { id: 'c4', nom: 'Luc Moreau', telephone: null },
]

const VEHICULES = [
  { id: 'v1', client_id: 'c1', marque: 'Dacia', modele: 'Sandero', immatriculation: 'MN-012-OP' },
  { id: 'v2', client_id: 'c2', marque: 'Renault', modele: 'Clio IV', immatriculation: 'AB-123-CD' },
  { id: 'v3', client_id: 'c3', marque: 'Citroën', modele: 'C3', immatriculation: 'IJ789KL' },
  { id: 'v4', client_id: 'c4', marque: 'Ford', modele: 'Transit', immatriculation: null },
]

const jeu = { vehicules: VEHICULES, clients: CLIENTS }

test('normalisations : accents, tirets, préfixe international', () => {
  assert.equal(normaliserTexte('Élodie Ngô'), 'elodie ngo')
  assert.equal(normaliserPlaque('AB-123-CD'), 'ab123cd')
  assert.equal(normaliserPlaque('ab 123 cd'), 'ab123cd')
  assert.equal(normaliserTelephone('+33 6 45 67 89 01'), '0645678901')
  assert.equal(normaliserTelephone('06.45.67.89.01'), '0645678901')
})

test('la plaque se trouve avec ou sans tirets, quelle que soit la casse', () => {
  for (const terme of ['AB-123-CD', 'ab123cd', 'AB 123 CD', 'ab-123-cd']) {
    const r = rechercherVehicules({ terme, ...jeu })
    assert.equal(r.length, 1, `échec pour « ${terme} »`)
    assert.equal(r[0].vehicule.id, 'v2')
    assert.equal(r[0].champ, 'plaque')
  }
})

test('une plaque saisie sans tirets en base se trouve avec tirets, et l’inverse', () => {
  assert.equal(rechercherVehicules({ terme: 'IJ-789-KL', ...jeu })[0]?.vehicule.id, 'v3')
  assert.equal(rechercherVehicules({ terme: 'ij789kl', ...jeu })[0]?.vehicule.id, 'v3')
})

test('le nom se trouve sans accents et partiellement', () => {
  assert.equal(rechercherVehicules({ terme: 'ngo', ...jeu })[0]?.vehicule.id, 'v1')
  assert.equal(rechercherVehicules({ terme: 'NGÔ', ...jeu })[0]?.vehicule.id, 'v1')
  assert.equal(rechercherVehicules({ terme: 'rochefoucauld', ...jeu })[0]?.vehicule.id, 'v2')
})

test('le téléphone se trouve quel que soit son format de saisie', () => {
  for (const terme of ['0645678901', '06 45 67 89 01', '+33645678901', '0645']) {
    const r = rechercherVehicules({ terme, ...jeu })
    assert.equal(r[0]?.vehicule.id, 'v1', `échec pour « ${terme} »`)
  }
})

test('résultats multiples : la plaque exacte passe devant', () => {
  // « c3 » est à la fois le modèle du véhicule 3 et un fragment de plaque.
  const r = rechercherVehicules({ terme: 'AB-123-CD', ...jeu })
  assert.equal(r[0].exact, true)
})

test('aucun résultat, et pas de plantage sur un terme vide ou trop court', () => {
  assert.deepEqual(rechercherVehicules({ terme: 'zzzzz', ...jeu }), [])
  assert.deepEqual(rechercherVehicules({ terme: '', ...jeu }), [])
  assert.deepEqual(rechercherVehicules({ terme: 'a', ...jeu }), [])
  assert.deepEqual(rechercherVehicules({ terme: '  ', ...jeu }), [])
})

test('un véhicule sans plaque reste trouvable par son client, et se nomme', () => {
  const r = rechercherVehicules({ terme: 'moreau', ...jeu })
  assert.equal(r[0]?.vehicule.id, 'v4')
  assert.equal(libelleVehicule(r[0].vehicule), 'Ford Transit · sans plaque')
})

test('un client sans téléphone ne fait pas échouer la recherche par numéro', () => {
  assert.doesNotThrow(() => rechercherVehicules({ terme: '0600000000', ...jeu }))
})

test('deux chiffres ne désignent personne', () => {
  assert.deepEqual(rechercherVehicules({ terme: '06', ...jeu }), [])
})

test('la limite de résultats est respectée', () => {
  const beaucoup = Array.from({ length: 30 }, (_, i) => ({
    id: `x${i}`, client_id: 'c2', marque: 'Renault', modele: 'Clio', immatriculation: `AB-${i}-CD`,
  }))
  assert.equal(rechercherVehicules({ terme: 'clio', vehicules: beaucoup, clients: CLIENTS }, 8).length, 0)
  assert.equal(rechercherVehicules({ terme: 'rochefoucauld', vehicules: beaucoup, clients: CLIENTS }, 8).length, 8)
})

test('libellés : ce qui a été reconnu, et comment se nomme un véhicule', () => {
  assert.equal(libelleCorrespondance('plaque'), 'plaque')
  assert.equal(libelleCorrespondance('telephone'), 'téléphone')
  assert.equal(libelleCorrespondance('nom'), 'client')
  assert.equal(libelleVehicule({ marque: 'Renault', modele: 'Clio', immatriculation: 'AB-123-CD' }), 'Renault Clio · AB-123-CD')
  assert.equal(libelleVehicule({ immatriculation: 'AB-123-CD' }), 'Véhicule · AB-123-CD')
  assert.equal(libelleVehicule({}), 'Véhicule sans plaque ni modèle')
})

test("un début de plaque ne va pas chercher ses chiffres dans les téléphones", () => {
  // Régression du 13 septembre 2026 : « ij789 » ramenait cinq voitures,
  // parce que « 789 » se trouve dans plusieurs numéros du garage.
  const r = rechercherVehicules({ terme: 'ij789', ...jeu })
  assert.equal(r.length, 1)
  assert.equal(r[0].vehicule.id, 'v3')
  assert.equal(r[0].champ, 'plaque')
})

test('une plaque entière ne ramène jamais de correspondance téléphone', () => {
  const r = rechercherVehicules({ terme: 'AB-123-CD', ...jeu })
  assert.ok(r.every((x) => x.champ !== 'telephone'))
})
