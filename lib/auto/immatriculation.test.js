import assert from "node:assert/strict";
import test from "node:test";

import { afficherImmatriculation, formatImmatriculation, normaliserImmatriculation } from "./immatriculation.js";

test("normaliser : majuscules, sans espace, tiret ni point", () => {
  assert.equal(normaliserImmatriculation(" ab-123-cd "), "AB123CD");
  assert.equal(normaliserImmatriculation("1234 ab 56"), "1234AB56");
  assert.equal(normaliserImmatriculation("ab.123.cd"), "AB123CD");
  assert.equal(normaliserImmatriculation("   "), null);
  assert.equal(normaliserImmatriculation(undefined), null);
});

test("format : SIV, FNI, autre, invalide", () => {
  assert.equal(formatImmatriculation("AB123CD"), "siv");
  assert.equal(formatImmatriculation("1234AB56"), "fni");
  assert.equal(formatImmatriculation("123ABC2A"), "fni");
  assert.equal(formatImmatriculation("B1234XY"), "autre");
  assert.equal(formatImmatriculation("AB 123"), "invalide");
  assert.equal(formatImmatriculation("A"), "invalide");
  assert.equal(formatImmatriculation(null), "invalide");
});

test("afficher : remet la présentation d'origine", () => {
  assert.equal(afficherImmatriculation("AB123CD"), "AB-123-CD");
  assert.equal(afficherImmatriculation("1234AB56"), "1234 AB 56");
  assert.equal(afficherImmatriculation("B1234XY"), "B1234XY");
  assert.equal(afficherImmatriculation(null), "");
});

test("la forme normalisée respecte la contrainte de la base", () => {
  const contrainte = /^[A-Z0-9]{2,12}$/;
  for (const saisie of ["ab-123-cd", "1234 AB 56", "b 1234 xy"]) {
    assert.match(normaliserImmatriculation(saisie), contrainte);
  }
});
