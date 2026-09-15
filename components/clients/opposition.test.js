// Exécution : node --test components/clients/opposition.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { clientOppose, libelleOpposition, messageErreurOpposition } from "./opposition.js";

test("aucune ligne ne vaut pas accord : « aucune opposition enregistrée »", () => {
  const l = libelleOpposition(null);
  assert.equal(l.oppose, false);
  assert.match(l.titre, /aucune opposition/);
  assert.match(l.detail, /devis et factures ne sont pas concernés/);
});

test("une opposition ou une révocation se lit comme un refus, avec sa date", () => {
  for (const statut of ["oppose", "revoque"]) {
    const l = libelleOpposition({ statut, created_at: "2026-09-15T10:00:00Z" });
    assert.equal(l.oppose, true, statut);
    assert.match(l.detail, /15 septembre 2026/);
  }
});

test("une autorisation, un inconnu ou une expiration ne sont pas une opposition", () => {
  for (const statut of ["autorise", "inconnu", "expire"]) assert.equal(clientOppose({ statut }), false, statut);
});

test("les refus de la base deviennent des phrases", () => {
  assert.match(messageErreurOpposition({ message: "Accès refusé au garage x" }), /titulaire du compte/);
  assert.match(messageErreurOpposition({ message: "Client y n'appartient pas au garage x" }), /n'appartient pas/);
  assert.match(messageErreurOpposition(null), /Rien n'a changé/);
});
