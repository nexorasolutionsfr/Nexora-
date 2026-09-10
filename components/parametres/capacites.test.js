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

test("une automatisation n'est annoncée disponible que contre une preuve d'envoi réel", () => {
  // Preuve du 10 septembre 2026 (recette Test, Assistant v2) : demande d'avis reçue au nom du
  // garage, bloquée avec motif journalisé sans e-mail client ou sans lien d'avis. Rien d'autre.
  const prouvees = ["demandeAvis"];
  for (const [nom, capacite] of Object.entries(CAPACITES)) {
    assert.equal(capacite.disponible, prouvees.includes(nom), `${nom} : disponibilité incohérente avec les preuves`);
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
