// Import pilote — tests locaux de la lecture de fichier.
//
// Exécution : node --test components/import-pilote/import.test.js
//
// Ces tests portent sur ce qui est réellement décidé côté client : découpage
// du CSV, détection du séparateur, association des colonnes, construction
// des lignes envoyées. La validation métier, les doublons et l'atomicité
// sont vérifiés en base par supabase/tests/import_pilote_v1.sql.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyserCsv,
  analyserFichier,
  champsManquants,
  champsReconnus,
  construireLignes,
  correspondanceUtilisable,
  detecterColonnes,
  detecterSeparateur,
  reduireEntete,
} from "./import.js";

import { MODELE_ENTETES, construireModeleCsv } from "./importConstants.js";

test("le séparateur est deviné sur la première ligne", () => {
  assert.equal(detecterSeparateur("a;b;c\n1;2;3"), ";");
  assert.equal(detecterSeparateur("a,b,c\n1,2,3"), ",");
  assert.equal(detecterSeparateur("a\tb\tc\n1\t2\t3"), "\t");
});

test("un point-virgule entre guillemets ne compte pas comme séparateur", () => {
  assert.equal(detecterSeparateur('"Dupont, Martin",0601020304'), ",");
});

test("les guillemets, guillemets doublés et sauts de ligne sont respectés", () => {
  const csv = 'nom;note\n"Dupont; Martin";"il a dit ""oui""\nsur deux lignes"\n';
  const lignes = analyserCsv(csv, ";");
  assert.equal(lignes.length, 2);
  assert.deepEqual(lignes[1], ["Dupont; Martin", 'il a dit "oui"\nsur deux lignes']);
});

test("le BOM d'Excel et les fins de ligne Windows sont absorbés", () => {
  const lignes = analyserCsv("﻿nom;tel\r\nDupont;0601020304\r\n", ";");
  assert.deepEqual(lignes[0], ["nom", "tel"]);
  assert.deepEqual(lignes[1], ["Dupont", "0601020304"]);
});

test("les lignes entièrement vides sont écartées", () => {
  const lignes = analyserCsv("nom;tel\n\n;\nDupont;0601020304\n", ";");
  assert.equal(lignes.length, 2);
});

test("les en-têtes sont réduits avant comparaison", () => {
  assert.equal(reduireEntete("  Kilométrage  "), "kilometrage");
  assert.equal(reduireEntete("N° de téléphone"), "ndetelephone");
  assert.equal(reduireEntete("E-Mail"), "email");
});

test("les en-têtes courants d'un export sont reconnus", () => {
  const c = detecterColonnes(["Nom du client", "Tél.", "E-mail", "Immat", "Marque", "Modèle", "KM"]);
  assert.deepEqual(c, {
    nom: 0,
    telephone: 1,
    email: 2,
    immatriculation: 3,
    marque: 4,
    modele: 5,
    kilometrage: 6,
  });
});

test("les en-têtes du modèle fourni sont tous reconnus", () => {
  const c = detecterColonnes(MODELE_ENTETES);
  assert.deepEqual(champsManquants(c), ["annee"]);
  assert.equal(correspondanceUtilisable(c), true);
});

test("une colonne inconnue est simplement ignorée", () => {
  const c = detecterColonnes(["Nom", "Code interne", "Solde comptable", "Immat"]);
  assert.deepEqual(champsReconnus(c), ["nom", "immatriculation"]);
  assert.equal(c["Code interne"], undefined);
});

test("une même colonne ne sert jamais à deux champs", () => {
  const c = detecterColonnes(["Nom", "Nom"]);
  assert.equal(c.nom, 0);
  assert.equal(Object.values(c).filter((v) => v === 1).length, 0);
});

test("sans colonne de nom, la correspondance est inutilisable", () => {
  assert.equal(correspondanceUtilisable(detecterColonnes(["Immat", "Marque"])), false);
  assert.equal(correspondanceUtilisable({}), false);
});

test("les lignes construites sautent l'en-tête et détourent les valeurs", () => {
  const brutes = [
    ["Nom", "Tel", "Immat"],
    ["  Dupont  ", " 06 01 02 03 04 ", "ab-123-cd"],
    ["Bernard", "", ""],
  ];
  const c = detecterColonnes(brutes[0]);
  const lignes = construireLignes(brutes, c);
  assert.deepEqual(lignes, [
    { nom: "Dupont", telephone: "06 01 02 03 04", immatriculation: "ab-123-cd" },
    { nom: "Bernard" },
  ]);
});

test("une colonne associée à la main est utilisée telle quelle", () => {
  const brutes = [
    ["Colonne A", "Colonne B"],
    ["Dupont", "AB-123-CD"],
  ];
  const lignes = construireLignes(brutes, { nom: 0, immatriculation: 1 });
  assert.deepEqual(lignes, [{ nom: "Dupont", immatriculation: "AB-123-CD" }]);
});

test("aucune valeur vide n'est envoyée à la base", () => {
  const lignes = construireLignes([["Dupont", "", "   "]], { nom: 0, email: 1, telephone: 2 }, {
    avecEntete: false,
  });
  assert.deepEqual(lignes, [{ nom: "Dupont" }]);
});

test("un fichier vide ou sans donnée est refusé avant tout appel", () => {
  assert.match(analyserFichier("").erreur, /vide/);
  assert.match(analyserFichier("nom;tel\n").erreur, /sans donnée/);
});

test("un fichier exploitable ressort sans erreur, avec ses en-têtes", () => {
  const r = analyserFichier("Nom;Tél;Immat\nDupont;0601020304;AB-123-CD\n");
  assert.equal(r.erreur, null);
  assert.equal(r.separateur, ";");
  assert.deepEqual(r.entetes, ["Nom", "Tél", "Immat"]);
  assert.equal(r.correspondance.nom, 0);
});

test("le modèle produit est relisible par notre propre analyseur", () => {
  const csv = construireModeleCsv();
  const r = analyserFichier(csv);
  assert.equal(r.erreur, null);
  assert.equal(correspondanceUtilisable(r.correspondance), true);
  const lignes = construireLignes(r.lignes, r.correspondance);
  assert.equal(lignes.length, 3);
  assert.equal(lignes[0].nom, "Martin Dupont");
  assert.equal(lignes[0].kilometrage, "142000");
  // La troisième ligne d'exemple est un client sans véhicule.
  assert.equal(lignes[2].immatriculation, undefined);
});
