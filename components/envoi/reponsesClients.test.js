// Exécution : node --test components/envoi/reponsesClients.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { libelleReponse, reponsesRecentes } from "./reponsesClients.js";

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
