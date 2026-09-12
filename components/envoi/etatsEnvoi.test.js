// États d'envoi — tests des phrases affichées.
//
// Exécution : node --test components/envoi/etatsEnvoi.test.js
//
// Deux règles sont verrouillées ici, parce qu'elles protègent le client :
// une mise en file ne se dit pas « envoyé », et un envoi incertain n'offre
// jamais de bouton « Réessayer ».

import assert from "node:assert/strict";
import { test } from "node:test";

import { DOCUMENTS, ETATS, GESTES_DEVIS, GESTES_FACTURE, MESSAGE_FACTURE_GENEREE, gestes, lireEtat, messageApresValidation, messageBlocage, messageFacturePayee, messageRefusValidation } from "./etatsEnvoi.js";

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
  // Revue du 2026-09-12 : « Il a accepté » ne disait pas qu'on enregistrait
  // une réponse obtenue ailleurs. Le libellé nomme la saisie.
  assert.match(GESTES_DEVIS.marquerAccepte, /^Enregistrer /);
  assert.match(GESTES_DEVIS.marquerRefuse, /^Enregistrer /);
  assert.match(GESTES_DEVIS.marquerAccepte, /re(ç|c)ue? autrement/);
  assert.match(GESTES_DEVIS.marquerRefuse, /re(ç|c)u autrement/);
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

// « Marquer payée » n'écrit à personne — règle du 12 septembre 2026. La phrase
// exacte est verrouillée ici : la veille, encaisser armait un « Confirmation
// de paiement » qui partait tout seul.
test("marquer payée dit qu'aucun message n'est parti", () => {
  const m = messageFacturePayee({ ok: true, deja_payee: false, envois_mis_de_cote: 0, envoi_incertain: false });
  assert.equal(m, "Facture marquée payée. Aucun message n'a été envoyé.");
});

test("un envoi programmé mis de côté est annoncé, avec sa raison", () => {
  const m = messageFacturePayee({ ok: true, deja_payee: false, envois_mis_de_cote: 1, envoi_incertain: false });
  assert.match(m, /^Facture marquée payée\. Aucun message n'a été envoyé\./);
  assert.match(m, /mis de côté/);
  assert.match(m, /annonçait une facture à régler/);
});

test("un envoi en cours au moment du paiement se vérifie, il ne se rejoue pas", () => {
  const m = messageFacturePayee({ ok: true, deja_payee: false, envois_mis_de_cote: 0, envoi_incertain: true });
  assert.match(m, /Aucun message n'a été envoyé\./);
  assert.match(m, /vérifiez avec le client/);
  assert.doesNotMatch(m, /renvoy|réessay/i);
});

test("les deux suites peuvent se cumuler, sans se contredire", () => {
  const m = messageFacturePayee({ ok: true, deja_payee: false, envois_mis_de_cote: 1, envoi_incertain: true });
  assert.match(m, /mis de côté/);
  assert.match(m, /vérifiez avec le client/);
});

test("le double clic ne raconte pas deux paiements", () => {
  const m = messageFacturePayee({ ok: true, deja_payee: true, envois_mis_de_cote: 0, envoi_incertain: false });
  assert.match(m, /était déjà marquée payée/);
  assert.match(m, /Aucun message n'a été envoyé\./);
});

// Le motif posé par `marquer_facture_payee` doit devenir une phrase qui dit
// quoi faire — sans quoi l'écran affichait le message passe-partout « L'envoi
// n'a pas pu se faire », qui n'explique rien.
test("une facture payée avant son envoi explique pourquoi le message attend", () => {
  const motif = "facture marquée payée avant l'envoi : le message annonçait une facture à régler";
  const e = lireEtat({ ok: true, etat: "bloque", motif }, "facture");
  assert.match(e.detail, /marquée payée/);
  assert.match(e.detail, /Relisez-le/);
  assert.doesNotMatch(e.detail, /contactez-nous/);
  assert.equal(e.peutValider, true);
  assert.equal(messageBlocage(motif, "facture"), e.detail);
});

// Le devis répondu avant l'envoi : un motif que le garage peut lire, pas le
// message passe-partout « L'envoi n'a pas pu se faire ».
test("un devis répondu avant son envoi explique pourquoi rien n'est parti", () => {
  const motif = "le devis a reçu une réponse avant l'envoi : ce message proposait un devis déjà traité";
  const e = lireEtat({ ok: true, etat: "bloque", motif }, "devis");
  assert.match(e.detail, /reçu sa réponse avant/);
  assert.match(e.detail, /Rien n'a été envoyé/);
  assert.doesNotMatch(e.detail, /contactez-nous/);
});
