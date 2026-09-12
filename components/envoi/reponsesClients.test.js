// Exécution : node --test components/envoi/reponsesClients.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORIGINE_CLIENT,
  ORIGINE_INCONNUE,
  mentionOrigine,
  origineReponse,
  titreReponse,
  libelleReponse, reponsesRecentes,
} from "./reponsesClients.js";

const MAINTENANT = new Date("2026-09-11T12:00:00Z");
const ilYa = (jours) => new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();

test("une acceptation du jour est retrouvée, un devis en attente non", () => {
  const liste = [
    { id: "a", statut: "accepte", date_validation: ilYa(0.1) },
    { id: "b", statut: "en_attente", date_validation: null },
  ];
  assert.deepEqual(reponsesRecentes(liste, MAINTENANT).map((d) => d.id), ["a"]);
});

test("les refus comptent aussi, du plus récent au plus ancien", () => {
  const liste = [
    { id: "vieux", statut: "refuse", date_validation: ilYa(3) },
    { id: "recent", statut: "accepte", date_validation: ilYa(1) },
  ];
  assert.deepEqual(reponsesRecentes(liste, MAINTENANT).map((d) => d.id), ["recent", "vieux"]);
});

test("au-delà de sept jours, la réponse vit dans l'historique seulement", () => {
  assert.equal(reponsesRecentes([{ id: "x", statut: "accepte", date_validation: ilYa(8) }], MAINTENANT).length, 0);
});

test("le libellé dit ce qu'a fait le client", () => {
  assert.equal(libelleReponse({ statut: "accepte" }), "Devis accepté");
  assert.equal(libelleReponse({ statut: "refuse" }), "Devis refusé");
});

// Revue du 12 septembre 2026 : rien ne distinguait un client qui clique d'un
// garagiste qui saisit l'accord reçu au téléphone. Les deux donnaient
// « Devis accepté par X — reçu à l'instant ».
test("un client qui répond depuis son lien est nommé comme l'auteur du geste", () => {
  const d = { statut: "accepte", reponse_origine: "client", client: "Julien Recette" };
  assert.equal(titreReponse(d), "Julien Recette a accepté son devis");
  assert.equal(mentionOrigine(d), "depuis son lien");
  assert.equal(origineReponse(d), ORIGINE_CLIENT);
});

test("un accord saisi par le garage ne se fait jamais passer pour un clic du client", () => {
  const d = { statut: "accepte", reponse_origine: "garage", client: "Julien Recette" };
  assert.equal(titreReponse(d), "Accord de Julien Recette enregistré par le garage");
  assert.equal(mentionOrigine(d), "saisi au comptoir");
  assert.doesNotMatch(titreReponse(d), /a accepté son devis/);
  const refus = { statut: "refuse", reponse_origine: "garage", client: "Julien Recette" };
  assert.equal(titreReponse(refus), "Refus de Julien Recette enregistré par le garage");
});

test("une réponse antérieure à la colonne ne s'invente pas une origine", () => {
  const d = { statut: "accepte", client: "Julien Recette" };
  assert.equal(origineReponse(d), ORIGINE_INCONNUE);
  assert.equal(titreReponse(d), "Devis accepté — Julien Recette");
  assert.equal(mentionOrigine(d), "origine non enregistrée");
  assert.doesNotMatch(titreReponse(d), /a accepté son devis|enregistré par le garage/);
  // Une valeur inattendue en base retombe sur « inconnue », jamais sur client.
  assert.equal(origineReponse({ statut: "accepte", reponse_origine: "robot" }), ORIGINE_INCONNUE);
});

test("un devis sans nom de client reste lisible", () => {
  assert.equal(titreReponse({ statut: "accepte", reponse_origine: "client" }), "ce client a accepté son devis");
  assert.equal(titreReponse({ statut: "refuse", reponse_origine: "client" }, "  "), "ce client a refusé son devis");
});
