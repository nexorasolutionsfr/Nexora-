// États d'envoi — tests des phrases affichées.
//
// Exécution : node --test components/envoi/etatsEnvoi.test.js
//
// Deux règles sont verrouillées ici, parce qu'elles protègent le client :
// une mise en file ne se dit pas « envoyé », et un envoi incertain n'offre
// jamais de bouton « Réessayer ».

import assert from "node:assert/strict";
import { test } from "node:test";

import { ETATS, lireEtat, messageBlocage, messageRefusValidation } from "./etatsEnvoi.js";

test("la mise en file ne se présente pas comme un envoi réussi", () => {
  const e = lireEtat({ ok: true, etat: "en_attente_envoi" });
  assert.equal(e.titre, "En attente d'envoi");
  assert.doesNotMatch(e.titre, /envoyé/i);
});

test("« envoyé » ne prétend pas que le client a lu", () => {
  const e = lireEtat({ ok: true, etat: "envoye" });
  assert.match(e.detail, /ouvert|lu/i);
});

test("un envoi incertain n'offre jamais de renvoi", () => {
  const e = lireEtat({ ok: true, etat: "envoi_en_cours" });
  assert.equal(e.peutReessayer, false);
  assert.equal(e.peutValider, false);
  assert.match(e.detail, /peut-être parti/i);
});

test("aucun état ne propose de réessayer", () => {
  for (const [nom, etat] of Object.entries(ETATS)) {
    assert.equal(etat.peutReessayer, false, `${nom} propose un renvoi`);
  }
});

test("un blocage explique quoi faire, sans détail interne", () => {
  assert.match(messageBlocage("adresse e-mail du client absente : aucun envoi possible"), /fiche/i);
  assert.match(messageBlocage("le devis ou le destinataire a changé depuis la validation"), /Revalidez/i);
  const inconnu = messageBlocage("ERREUR SQLSTATE 42P01 relation inexistante");
  assert.doesNotMatch(inconnu, /SQLSTATE|relation/i);
});

test("les refus de validation sont dits en clair", () => {
  assert.match(messageRefusValidation("destinataire_absent"), /adresse e-mail/i);
  assert.match(messageRefusValidation("destinataire_different"), /changé/i);
  assert.match(messageRefusValidation("bidule"), /Réessayez/i);
});
