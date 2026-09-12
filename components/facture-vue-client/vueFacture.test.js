// Vue client de la facture — la page publique et l'aperçu du garage disent la
// même chose.
//
// Exécution : node --test components/facture-vue-client/vueFacture.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { euros, vueDepuisFactureGarage, vueDepuisLecturePublique } from "./vueFacture.js";

const LIGNES = [
  { type: "main_oeuvre", description: "Vidange", quantite: 1, prix_unitaire_ht: 60 },
  { type: "piece", description: "Filtre à huile", quantite: 2, prix_unitaire_ht: 20 },
];

test("la page publique et l'écran du garage produisent la même vue", () => {
  const publique = vueDepuisLecturePublique({
    ok: true,
    garage_nom: "Garage Recette",
    numero: "F-2026-0007",
    vehicule: "Renault Clio",
    motif: "Révision",
    montant_ttc: 120,
    statut: "en_attente",
    lignes: LIGNES,
  });
  const garage = vueDepuisFactureGarage(
    {
      numero: "F-2026-0007",
      motif: "Révision",
      montant_ttc: "120.00",
      statut: "en_attente",
      lignes: LIGNES,
      vehicules: { marque: "Renault", modele: "Clio", immatriculation: "AA-123-BB" },
      clients: { nom: "Client" },
    },
    "Garage Recette"
  );
  assert.deepEqual(garage, publique);
  assert.equal(publique.payee, false);
  assert.deepEqual(publique.lignes.map((l) => l.montant), [60, 40]);
});

test("une facture payée se voit, et une facture sans lignes reste lisible", () => {
  const v = vueDepuisLecturePublique({ garage_nom: "", numero: "F-1", vehicule: " ", montant_ttc: 0, statut: "payee", lignes: null });
  assert.equal(v.payee, true);
  assert.equal(v.garage, "Votre garage");
  assert.equal(v.vehicule, "");
  assert.deepEqual(v.lignes, []);
});

test("les montants s'écrivent à deux décimales", () => {
  assert.equal(euros(120), "120.00 €");
  assert.equal(euros("144.5"), "144.50 €");
  assert.equal(euros(null), "0.00 €");
});

test("sans facture, pas de vue", () => {
  assert.equal(vueDepuisLecturePublique(null), null);
  assert.equal(vueDepuisFactureGarage(undefined, "x"), null);
});
