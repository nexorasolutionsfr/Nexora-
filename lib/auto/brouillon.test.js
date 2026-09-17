import assert from "node:assert/strict";
import test from "node:test";

import { DUREE_BROUILLON_MS, ecrireBrouillon, effacerBrouillon, effacerBrouillons, lireBrouillon } from "./brouillon.js";

function memoire() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (c) => (m.has(c) ? m.get(c) : null),
    setItem: (c, v) => m.set(c, String(v)),
    removeItem: (c) => m.delete(c),
    brut: m,
  };
}

const saisie = { dateIntervention: "2026-03-12", dateFacture: "2026-03-14", professionnel: "Garage fictif", kilometrage: "84 200", montant: "189,90", type: "vidange", operations: [{ type: "vidange", libelle: "Vidange moteur" }] };

test("brouillon : écrit puis relu à l'identique, par document", () => {
  const stockage = memoire();
  assert.equal(ecrireBrouillon("doc-1", { saisie, choix: "creer", mode: "intervention", touches: ["montant", "montant"] }, { stockage, maintenant: 1000 }), true);
  assert.deepEqual(lireBrouillon("doc-1", { stockage, maintenant: 2000 }), { saisie, choix: "creer", mode: "intervention", touches: ["montant"] });
  assert.equal(lireBrouillon("doc-2", { stockage, maintenant: 2000 }), null);
});

test("brouillon : périmé après 7 jours, et alors effacé", () => {
  const stockage = memoire();
  ecrireBrouillon("doc-1", { saisie }, { stockage, maintenant: 0 });
  assert.equal(lireBrouillon("doc-1", { stockage, maintenant: DUREE_BROUILLON_MS + 1 }), null);
  assert.equal(stockage.brut.size, 0);
});

test("brouillon : un contenu abîmé ou inattendu est ignoré", () => {
  const stockage = memoire();
  stockage.setItem("nexora-auto-brouillon-facture:doc-1", "{pas du json");
  assert.equal(lireBrouillon("doc-1", { stockage }), null);
  stockage.setItem("nexora-auto-brouillon-facture:doc-2", JSON.stringify({ version: 1, le: Date.now(), saisie: { ...saisie, montant: 42 } }));
  assert.equal(lireBrouillon("doc-2", { stockage }), null);
  stockage.setItem("nexora-auto-brouillon-facture:doc-3", JSON.stringify({ version: 1, le: Date.now(), saisie, touches: ["immatriculation"] }));
  assert.equal(lireBrouillon("doc-3", { stockage }), null);
  assert.equal(ecrireBrouillon("doc-4", { saisie, mode: "fusion" }, { stockage }), false);
  // Les clés en trop ne sont pas reprises.
  stockage.setItem("nexora-auto-brouillon-facture:doc-5", JSON.stringify({ version: 1, le: Date.now(), saisie: { ...saisie, secret: "x" } }));
  assert.equal("secret" in lireBrouillon("doc-5", { stockage }).saisie, false);
});

test("brouillon : effacé seul, ou tous à la déconnexion sans toucher au reste", () => {
  const stockage = memoire();
  ecrireBrouillon("doc-1", { saisie }, { stockage });
  ecrireBrouillon("doc-2", { saisie }, { stockage });
  stockage.setItem("nexora-auto-premiers-pas-masques", "1");
  effacerBrouillon("doc-1", { stockage });
  assert.equal(lireBrouillon("doc-1", { stockage }), null);
  effacerBrouillons({ stockage });
  assert.deepEqual([...stockage.brut.keys()], ["nexora-auto-premiers-pas-masques"]);
});

test("brouillon : sans stockage (navigation privée bloquée), rien ne casse", () => {
  const casse = { getItem: () => { throw new Error("bloqué"); }, setItem: () => { throw new Error("bloqué"); }, removeItem: () => { throw new Error("bloqué"); } };
  assert.equal(lireBrouillon("doc-1", { stockage: casse }), null);
  assert.equal(ecrireBrouillon("doc-1", { saisie }, { stockage: casse }), false);
  assert.equal(ecrireBrouillon("doc-1", { saisie }, { stockage: null }), false);
  effacerBrouillons({ stockage: casse });
});
