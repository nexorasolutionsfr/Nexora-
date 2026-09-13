import assert from "node:assert/strict";
import test from "node:test";

import {
  MESSAGE_GENERIQUE,
  estDoublonDePlaque,
  messageErreurVehicule,
} from "./erreurVehicule.js";

// Forme réelle d'une erreur supabase-js relayant notre `raise exception`,
// relevée le 13 septembre 2026 sur Test.
const DOUBLON = {
  code: "23505",
  message:
    "Ce garage a deja un vehicule immatricule BA-101-AA. Ouvrez sa fiche au lieu d'en creer une seconde.",
};

test("le doublon de plaque est reconnu et son message repris tel quel", () => {
  assert.equal(estDoublonDePlaque(DOUBLON), true);
  assert.equal(messageErreurVehicule(DOUBLON), DOUBLON.message);
});

test("le message nomme la plaque déjà enregistrée, pas celle qu'on vient de taper", () => {
  // C'est la fiche existante qu'il faut retrouver : la base renvoie donc la
  // plaque telle qu'elle est stockée, même si la saisie s'écrivait autrement.
  assert.match(messageErreurVehicule(DOUBLON), /BA-101-AA/);
});

test("une autre contrainte d'unicité ne se fait pas passer pour un doublon de plaque", () => {
  const autre = { code: "23505", message: 'duplicate key value violates unique constraint "clients_email_key"' };
  assert.equal(estDoublonDePlaque(autre), false);
  assert.equal(messageErreurVehicule(autre), MESSAGE_GENERIQUE);
});

test("un droit refusé, une panne ou une absence d'erreur retombent sur le message neutre", () => {
  assert.equal(messageErreurVehicule({ code: "42501", message: "Accès refusé" }), MESSAGE_GENERIQUE);
  assert.equal(messageErreurVehicule({ message: "Failed to fetch" }), MESSAGE_GENERIQUE);
  assert.equal(messageErreurVehicule(null), MESSAGE_GENERIQUE);
  assert.equal(messageErreurVehicule(undefined), MESSAGE_GENERIQUE);
});

test("le message neutre ne prétend pas connaître la cause", () => {
  assert.doesNotMatch(MESSAGE_GENERIQUE, /immatricul|plaque|doublon/i);
});
