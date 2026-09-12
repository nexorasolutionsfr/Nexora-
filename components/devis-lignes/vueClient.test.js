// Ce que voit le client — l'aperçu du garage et la page publique doivent
// produire la même vue.
//
// Exécution : node --test components/devis-lignes/vueClient.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import { vueDepuisDevisGarage, vueDepuisPagePublique } from "./vueClient.js";

// Le devis de la recette du 2026-09-11, vu des deux côtés.
const DEVIS_GARAGE = {
  vehicule: "Renault Clio IV",
  immatriculation: "DEMO-110-DM",
  prestation: "Freins avant",
  prestations: { nom: "Freins avant" },
  montant_ht: 105,
  montant_ttc: 126,
  devis_lignes: [
    { id: "p", type: "piece", libelle: "Jeu de plaquettes avant", quantite: 1, prix_unitaire_ht: 45, taux_tva: 20, position: 1, montant_ht: 45, montant_tva: 9 },
    { id: "m", type: "main_oeuvre", libelle: "Remplacement plaquettes avant", quantite: 1, prix_unitaire_ht: 60, taux_tva: 20, position: 0, montant_ht: 60, montant_tva: 12 },
  ],
};

const REPONSE_PUBLIQUE = {
  ok: true,
  garage_nom: "Garage Recette",
  vehicule: "Renault Clio IV",
  prestation: "Freins avant",
  montant_ht: 105,
  montant_ttc: 126,
  statut: "en_attente",
  lignes: [
    { id: "m", type: "main_oeuvre", libelle: "Remplacement plaquettes avant", quantite: 1, prix_unitaire_ht: 60, taux_tva: 20, montant_ttc: 72 },
    { id: "p", type: "piece", libelle: "Jeu de plaquettes avant", quantite: 1, prix_unitaire_ht: 45, taux_tva: 20, montant_ttc: 54 },
  ],
};

test("l'aperçu du garage et la page publique montrent la même chose", () => {
  assert.deepEqual(vueDepuisDevisGarage(DEVIS_GARAGE, "Garage Recette"), vueDepuisPagePublique(REPONSE_PUBLIQUE));
});

test("l'aperçu porte les lignes et la TVA, pas seulement le total", () => {
  const v = vueDepuisDevisGarage(DEVIS_GARAGE, "Garage Recette");
  assert.equal(v.lignes.length, 2);
  assert.equal(v.lignes[0].libelle, "Remplacement plaquettes avant", "ordre de saisie respecté");
  assert.equal(v.lignes[0].type, "Main d'œuvre");
  assert.equal(v.montantTva, 21);
  assert.equal(v.montantTtc, 126);
});

test("sans véhicule ni prestation, les deux côtés retombent sur les mêmes mots", () => {
  const garage = vueDepuisDevisGarage({ vehicule: "", prestation: "Prestation", montant_ht: 0, montant_ttc: 0, devis_lignes: [] }, "");
  const publique = vueDepuisPagePublique({ vehicule: "", prestation: null, montant_ht: 0, montant_ttc: 0, lignes: [] });
  assert.deepEqual(garage, publique);
  assert.equal(garage.vehicule, "Véhicule");
  assert.equal(garage.prestation, "—");
});
