// Ce que Nexora sait faire — tests de la table de vérité.
//
// Exécution : node --test components/parametres/capacites.test.js
//
// Ces tests ne vérifient pas des textes : ils verrouillent une règle. Une
// capacité ne passe à « disponible » que délibérément, et l'écran ne peut
// pas annoncer un canal qui n'envoie rien. Si l'un d'eux casse parce qu'une
// valeur est passée à `true`, c'est la preuve d'envoi réel qu'il faut
// produire avant de corriger le test.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANAUX,
  CAPACITES,
  canalDisponible,
  canalEffectif,
  mentionCanalIndisponible,
} from "./capacites.js";

test("aucune automatisation n'est annoncée disponible sans preuve d'envoi", () => {
  for (const [nom, capacite] of Object.entries(CAPACITES)) {
    assert.equal(capacite.disponible, false, `${nom} : passé à disponible sans preuve ?`);
    assert.ok(capacite.resume.length > 10, `${nom} : il manque le résumé`);
    assert.ok(capacite.utilisable.length > 10, `${nom} : il manque ce qui reste utilisable`);
  }
});

test("seul l'e-mail part réellement", () => {
  assert.equal(canalDisponible("email"), true);
  assert.equal(canalDisponible("sms"), false);
  assert.equal(canalDisponible("whatsapp"), false);
  assert.equal(canalDisponible("pigeon"), false);
  assert.deepEqual(CANAUX.filter((c) => c.disponible).map((c) => c.key), ["email"]);
});

test("le canal effectif retombe sur l'e-mail sans toucher à la préférence", () => {
  assert.equal(canalEffectif("email"), "email");
  assert.equal(canalEffectif("sms"), "email");
  assert.equal(canalEffectif("whatsapp"), "email");
  assert.equal(canalEffectif(undefined), "email");
});

test("un canal indisponible est dit, pas caché", () => {
  assert.match(mentionCanalIndisponible("sms"), /SMS/);
  assert.match(mentionCanalIndisponible("sms"), /e-mail/);
  assert.match(mentionCanalIndisponible("whatsapp"), /WhatsApp/);
  assert.equal(mentionCanalIndisponible("email"), null);
  assert.equal(mentionCanalIndisponible("inconnu"), null);
});
