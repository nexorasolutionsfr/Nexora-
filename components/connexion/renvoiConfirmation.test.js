// Renvoi de l'e-mail de confirmation — tests des décisions.
//
// Exécution : node --test components/connexion/renvoiConfirmation.test.js
//
// Ce qui est vérifié ici : le décompte, le libellé du bouton, et surtout le
// fait qu'un échec ne raconte jamais l'état du compte. Ce dernier point est
// une règle de confidentialité, pas une préférence de rédaction : c'est le
// test à ne pas supprimer si le texte change.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DELAI_RENVOI_SECONDES,
  libelleRenvoi,
  messageRenvoi,
  secondesAvantRenvoi,
} from "./renvoiConfirmation.js";

test("le délai de renvoi laisse le temps à l'e-mail d'arriver", () => {
  assert.equal(DELAI_RENVOI_SECONDES, 60);
});

test("le décompte tombe à zéro puis n'y descend pas", () => {
  const maintenant = 1_000_000;
  assert.equal(secondesAvantRenvoi(maintenant + 60_000, maintenant), 60);
  assert.equal(secondesAvantRenvoi(maintenant + 1_500, maintenant), 2);
  assert.equal(secondesAvantRenvoi(maintenant, maintenant), 0);
  assert.equal(secondesAvantRenvoi(maintenant - 30_000, maintenant), 0);
});

test("sans échéance, le renvoi est disponible", () => {
  assert.equal(secondesAvantRenvoi(null, 1_000_000), 0);
  assert.equal(secondesAvantRenvoi(undefined), 0);
});

test("le bouton dit l'attente plutôt que de rester grisé sans raison", () => {
  assert.equal(libelleRenvoi({ secondesRestantes: 47 }), "Renvoyer l'e-mail (47 s)");
  assert.equal(libelleRenvoi({ secondesRestantes: 0 }), "Renvoyer l'e-mail");
  assert.equal(libelleRenvoi({ enCours: true, secondesRestantes: 47 }), "Envoi…");
  assert.equal(libelleRenvoi(), "Renvoyer l'e-mail");
});

test("le succès nomme le destinataire et prévient du délai, sans prétendre à la réception", () => {
  const message = messageRenvoi(null, "contact@garage-exemple.fr");
  assert.equal(message.ton, "succes");
  assert.match(message.texte, /contact@garage-exemple\.fr/);
  assert.match(message.texte, /minute/);
  assert.match(message.texte, /a été demandé/);
  assert.match(message.texte, /dernier message reçu/);
  assert.doesNotMatch(message.texte, /envoyé|délivré/i);
});

test("le succès reste lisible même sans adresse sous la main", () => {
  const message = messageRenvoi(undefined, "");
  assert.equal(message.ton, "succes");
  assert.doesNotMatch(message.texte, /undefined|null/);
});

test("le quota d'envoi a son propre message, avec la conduite à tenir", () => {
  for (const erreur of [
    { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    { status: 429, message: "email rate limit exceeded" },
    { message: "For security purposes, rate limit reached" },
  ]) {
    const message = messageRenvoi(erreur, "contact@garage-exemple.fr");
    assert.equal(message.ton, "erreur");
    assert.match(message.texte, /heure/);
    assert.match(message.texte, /reste valable/);
  }
});

test("aucun échec ne révèle si l'adresse possède déjà un compte", () => {
  for (const erreur of [
    { code: "user_already_exists", message: "User already registered" },
    { status: 422, message: "User already confirmed" },
    { message: "Signups not allowed for otp" },
    { message: "" },
  ]) {
    const message = messageRenvoi(erreur, "contact@garage-exemple.fr");
    assert.equal(message.ton, "erreur");
    assert.doesNotMatch(message.texte, /déjà (inscrit|enregistré|confirmé)/i);
    assert.doesNotMatch(message.texte, /existe/i);
    assert.doesNotMatch(message.texte, /confirmé/i);
  }
});
