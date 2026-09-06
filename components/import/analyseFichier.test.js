import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyser,
  apercu,
  construireLignes,
  decouperLigne,
  deviner,
  devinerSeparateur,
  normaliser,
} from './analyseFichier.js'

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

test('normaliser retire accents, casse et ponctuation', () => {
  assert.equal(normaliser('Téléphone'), 'telephone')
  assert.equal(normaliser('N° Immat.'), 'n immat')
  assert.equal(normaliser('  MODÈLE  '), 'modele')
  assert.equal(normaliser('E-Mail'), 'e mail')
  assert.equal(normaliser(null), '')
})

// ---------------------------------------------------------------------------
// Découpage
// ---------------------------------------------------------------------------

test('decouperLigne respecte les guillemets et les séparateurs internes', () => {
  assert.deepEqual(
    decouperLigne('Dupont;"12, rue des Lilas";0325000000', ';'),
    ['Dupont', '12, rue des Lilas', '0325000000']
  )
})

test('decouperLigne gère le guillemet doublé', () => {
  assert.deepEqual(
    decouperLigne('"Garage ""Le Phare""";Reims', ';'),
    ['Garage "Le Phare"', 'Reims']
  )
})

test('decouperLigne conserve les colonnes vides', () => {
  assert.deepEqual(decouperLigne('a;;c', ';'), ['a', '', 'c'])
})

// ---------------------------------------------------------------------------
// Séparateur
// ---------------------------------------------------------------------------

test('devinerSeparateur choisit le point-virgule des exports français', () => {
  const csv = 'Nom;Email;Téléphone\nDupont;a@b.fr;0300000000\nMartin;c@d.fr;0400000000'
  assert.equal(devinerSeparateur(csv), ';')
})

test('devinerSeparateur ne se laisse pas piéger par des virgules dans les données', () => {
  // Trois virgules par ligne dans les adresses, mais seul le point-virgule
  // découpe régulièrement. Compter les occurrences donnerait la virgule.
  const csv = [
    'Nom;Adresse;Ville',
    'Dupont;"12, rue des Lilas, bis";Reims',
    'Martin;"3, avenue Jean, Jaurès, appt 4";Troyes',
  ].join('\n')
  assert.equal(devinerSeparateur(csv), ';')
})

test('devinerSeparateur reconnaît la tabulation', () => {
  const tsv = 'Nom\tEmail\nDupont\ta@b.fr\nMartin\tc@d.fr'
  assert.equal(devinerSeparateur(tsv), '\t')
})

// ---------------------------------------------------------------------------
// Reconnaissance des colonnes
// ---------------------------------------------------------------------------

test('deviner reconnaît un export français classique', () => {
  const c = deviner(['Nom du client', 'E-mail', 'Téléphone', 'Immatriculation', 'Marque', 'Modèle', 'Année', 'Kilométrage'])
  assert.deepEqual(c, {
    nom: 0, email: 1, telephone: 2, immatriculation: 3,
    marque: 4, modele: 5, annee: 6, kilometrage: 7,
  })
})

test('deviner reconnaît des intitulés abrégés et anglais', () => {
  const c = deviner(['Client', 'Mail', 'Portable', 'Immat', 'Make', 'Model', 'Year', 'Km'])
  assert.deepEqual(c, {
    nom: 0, email: 1, telephone: 2, immatriculation: 3,
    marque: 4, modele: 5, annee: 6, kilometrage: 7,
  })
})

test('deviner laisse à null ce qu il ne reconnaît pas', () => {
  const c = deviner(['Nom', 'Code interne', 'Solde'])
  assert.equal(c.nom, 0)
  assert.equal(c.email, null)
  assert.equal(c.immatriculation, null)
})

test('deux champs ne partagent jamais la même colonne', () => {
  // « Mail » et « E-mail » pourraient tous deux répondre au champ email ;
  // un seul doit être retenu, et aucune autre clé ne doit pointer dessus.
  const c = deviner(['Nom', 'E-mail', 'Mail secondaire'])
  const utilisees = Object.values(c).filter((v) => v !== null)
  assert.equal(new Set(utilisees).size, utilisees.length)
})

test('une colonne « Client email » ne devient pas le nom du client', () => {
  // Piège réel : « client » est un motif du champ nom, et il apparaît ici dans
  // une colonne d'e-mail. L'ordre de résolution doit donner la colonne à email.
  const c = deviner(['Client email', 'Nom'])
  assert.equal(c.email, 0)
  assert.equal(c.nom, 1)
})

test('l égalité stricte prime sur la correspondance partielle', () => {
  // « Marque » exact est en position 1 ; « Marque vehicule » en position 0
  // correspondrait aussi. C'est l'exact qui doit gagner.
  const c = deviner(['Ancienne marque vehicule', 'Marque'])
  assert.equal(c.marque, 1)
})

// ---------------------------------------------------------------------------
// Analyse complète
// ---------------------------------------------------------------------------

const EXPORT_REEL = [
  'Nom du client;E-mail;Téléphone;Immatriculation;Marque;Modèle;Année;Kilométrage',
  'Dupont Jean;jean.dupont@example.fr;03 25 00 00 00;AB-123-CD;Renault;Clio;2018;87000',
  'Martin Sophie;;06 12 34 56 78;EF-456-GH;Peugeot;208;2020;41000',
  '"Société ""Bel Air""";contact@belair.fr;0325111111;IJ-789-KL;Citroën;Berlingo;2016;152000',
].join('\r\n')

test('analyser lit un export complet avec BOM et retours Windows', () => {
  const r = analyser('﻿' + EXPORT_REEL)
  assert.equal(r.erreur, null)
  assert.equal(r.separateur, ';')
  assert.equal(r.entetes[0], 'Nom du client', 'le BOM ne doit pas coller au premier en-tête')
  assert.equal(r.lignes.length, 3)
  assert.equal(r.correspondance.immatriculation, 3)
})

test('analyser signale un fichier vide', () => {
  assert.match(analyser('').erreur, /vide/i)
})

test('analyser signale un fichier sans colonnes exploitables', () => {
  assert.match(analyser('juste une phrase sans separateur').erreur, /colonne/i)
})

// ---------------------------------------------------------------------------
// Construction du tableau envoyé à la base
// ---------------------------------------------------------------------------

test('construireLignes produit exactement les clés attendues par la base', () => {
  const r = analyser(EXPORT_REEL)
  const lignes = construireLignes(r.lignes, r.correspondance)
  assert.equal(lignes.length, 3)
  assert.deepEqual(Object.keys(lignes[0]).sort(), [
    'annee', 'email', 'immatriculation', 'kilometrage',
    'marque', 'modele', 'nom', 'telephone',
  ])
  assert.equal(lignes[0].nom, 'Dupont Jean')
  assert.equal(lignes[0].immatriculation, 'AB-123-CD')
  assert.equal(lignes[1].email, '', 'un champ absent devient une chaîne vide, pas undefined')
  assert.equal(lignes[2].nom, 'Société "Bel Air"')
})

test('construireLignes met une chaîne vide pour un champ non associé', () => {
  const r = analyser('Nom;Ville\nDupont;Reims')
  const lignes = construireLignes(r.lignes, r.correspondance)
  assert.equal(lignes[0].nom, 'Dupont')
  assert.equal(lignes[0].immatriculation, '')
})

test('construireLignes écarte les lignes entièrement vides', () => {
  // Les exports se terminent souvent par des lignes de séparateurs seuls. Les
  // envoyer ferait gonfler le compteur de rejets pour rien.
  const r = analyser('Nom;Email\nDupont;a@b.fr\n;\nMartin;c@d.fr')
  const lignes = construireLignes(r.lignes, r.correspondance)
  assert.equal(lignes.length, 2)
})

test('apercu ne rend que les premières lignes', () => {
  const r = analyser(EXPORT_REEL)
  assert.equal(apercu(r.lignes, r.correspondance, 2).length, 2)
})
