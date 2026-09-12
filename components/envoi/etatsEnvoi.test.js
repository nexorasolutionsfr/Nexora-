// États d'envoi — tests des phrases affichées.
//
// Exécution : node --test components/envoi/etatsEnvoi.test.js
//
// Deux règles sont verrouillées ici, parce qu'elles protègent le client :
// une mise en file ne se dit pas « envoyé », et un envoi incertain n'offre
// jamais de bouton « Réessayer ».

import assert from "node:assert/strict";
import { test } from "node:test";

import { DOCUMENTS, ETATS, GESTES_DEVIS, GESTES_FACTURE, MESSAGE_FACTURE_GENEREE, gestes, lireEtat, messageApresValidation, messageBlocage, messageRefusValidation } from "./etatsEnvoi.js";

// Recette du 2026-09-11 : un devis tout juste créé affichait « En attente
// d'envoi » et plus aucun bouton. Un devis neuf doit dire que rien n'est parti
// et proposer l'envoi.
test("un devis neuf dit que rien n'est parti et propose l'envoi", () => {
  for (const cle of ["aucune", "a_valider"]) {
    const e = lireEtat({ ok: true, etat: cle });
    assert.equal(e.peutValider, true);
    assert.match(e.detail, /Rien n'est parti/);
  }
});

test("la confirmation d'une mise en file ne dit ni « envoyé » ni un délai", () => {
  const m = messageApresValidation(false);
  assert.match(m, /^Envoi programmé/);
  assert.doesNotMatch(m, /minute|instant|bientôt|validé/i);
  assert.match(messageApresValidation(true), /déjà programmé/);
});

test("lien, envoi et réponse du client ne se confondent pas", () => {
  // Seuls les deux gestes d'envoi parlent d'envoyer.
  assert.match(GESTES_DEVIS.ouvrirEnvoi, /Envoyer/);
  assert.match(GESTES_DEVIS.confirmerEnvoi, /envoyer/);
  for (const cle of ["lien", "apercu", "marquerAccepte", "marquerRefuse", "reponseAutre"]) {
    assert.doesNotMatch(GESTES_DEVIS[cle], /envoy/i, `${cle} parle d'envoi`);
  }
  // Le lien dit ce qu'il ne fait pas.
  assert.match(GESTES_DEVIS.lienAide, /n'envoie rien/);
  // Noter la réponse désigne le client, pas le garage.
  assert.match(GESTES_DEVIS.marquerAccepte, /^Il /);
  assert.match(GESTES_DEVIS.marquerRefuse, /^Il /);
});

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

// 12 septembre 2026 : la facture prend le parcours du devis, sans en partager
// une seule fonction de base — chaque document a les siennes, avec leurs
// droits.
test("la facture a ses propres fonctions de base, et les mêmes états que le devis", () => {
  for (const cle of ["rpcEtat", "rpcApercu", "rpcAutoriser", "idParam"]) {
    assert.notEqual(DOCUMENTS.facture[cle], DOCUMENTS.devis[cle], `${cle} partagé`);
    assert.match(DOCUMENTS.facture[cle], /facture/);
  }
  for (const etat of Object.keys(ETATS)) {
    assert.equal(lireEtat({ ok: true, etat }, "facture").titre, lireEtat({ ok: true, etat }, "devis").titre);
  }
});

test("les phrases de la facture nomment la facture, pas le devis", () => {
  assert.match(messageRefusValidation("aucune_notification_en_attente", "facture"), /^La facture .* envoyée\.$/);
  assert.doesNotMatch(messageRefusValidation("aucune_notification_en_attente", "facture"), /devis/i);
  const bloque = lireEtat({ ok: true, etat: "bloque", motif: "la facture ou le destinataire a changé depuis la validation" }, "facture");
  assert.match(bloque.detail, /^La facture ou l'adresse du client a changé/);
  assert.equal(bloque.peutValider, true);
  assert.match(DOCUMENTS.facture.lienAjoute, /lien de la facture/);
});

test("les gestes de la facture sont ceux du devis, sans noter de réponse", () => {
  assert.equal(gestes("facture"), GESTES_FACTURE);
  assert.equal(gestes("devis"), GESTES_DEVIS);
  assert.equal(GESTES_FACTURE.ouvrirEnvoi, GESTES_DEVIS.ouvrirEnvoi);
  assert.equal(GESTES_FACTURE.confirmerEnvoi, GESTES_DEVIS.confirmerEnvoi);
  assert.match(GESTES_FACTURE.lienAide, /n'envoie rien/);
  assert.equal(GESTES_FACTURE.marquerAccepte, undefined);
});

test("« Facture générée » dit que rien n'est parti", () => {
  assert.match(MESSAGE_FACTURE_GENEREE, /Rien n'est envoyé/);
  assert.doesNotMatch(MESSAGE_FACTURE_GENEREE, /envoyée au client|programmé/);
});
