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
  assert.equal(garage.prestation, null, "pas de « — » isolé sous le véhicule");
});

test("un devis préparé depuis un constat, sans prestation, n'affiche pas de tiret", () => {
  const v = vueDepuisPagePublique({ ...REPONSE_PUBLIQUE, prestation: null });
  assert.equal(v.prestation, null);
  assert.equal(vueDepuisPagePublique(REPONSE_PUBLIQUE).prestation, "Freins avant");
});

test("un constat et sa photo se montrent une fois, pas sur chaque ligne qui le chiffre", () => {
  const v = vueDepuisPagePublique({
    ...REPONSE_PUBLIQUE,
    lignes: [
      { id: "c", type: "main_oeuvre", libelle: "Pare-chocs avant fendu", quantite: 1, prix_unitaire_ht: 185, taux_tva: 20, montant_ttc: 222, preuve: { constat: "Fente de 10 cm", photos: ["ph1"] } },
      { id: "m", type: "main_oeuvre", libelle: "Dépose et repose", quantite: 1, prix_unitaire_ht: 60, taux_tva: 20, montant_ttc: 72, preuve: { constat: null, photos: ["ph1"] } },
      { id: "p", type: "piece", libelle: "Kit d'agrafes", quantite: 1, prix_unitaire_ht: 12, taux_tva: 20, montant_ttc: 14.4, preuve: { constat: null, photos: ["ph1"] } },
    ],
  });
  assert.deepEqual(v.lignes.map((l) => l.preuve), [{ constat: "Fente de 10 cm", photos: ["ph1"] }, null, null]);
  assert.equal(v.lignes.length, 3, "les lignes restent, seule la preuve répétée disparaît");
});

test("une ligne suivante garde sa preuve si elle a son propre texte ou une photo nouvelle", () => {
  const v = vueDepuisPagePublique({
    ...REPONSE_PUBLIQUE,
    lignes: [
      { id: "a", type: "main_oeuvre", libelle: "A", quantite: 1, prix_unitaire_ht: 1, taux_tva: 20, montant_ttc: 1.2, preuve: { constat: "Premier", photos: ["ph1"] } },
      { id: "b", type: "main_oeuvre", libelle: "B", quantite: 1, prix_unitaire_ht: 1, taux_tva: 20, montant_ttc: 1.2, preuve: { constat: "Second constat", photos: ["ph1"] } },
      { id: "c", type: "piece", libelle: "C", quantite: 1, prix_unitaire_ht: 1, taux_tva: 20, montant_ttc: 1.2, preuve: { constat: null, photos: ["ph1", "ph2"] } },
    ],
  });
  assert.deepEqual(v.lignes[1].preuve, { constat: "Second constat", photos: ["ph1"] });
  assert.deepEqual(v.lignes[2].preuve, { constat: null, photos: ["ph1", "ph2"] });
});

test("une ligne reprise d'un constat porte sa preuve, des deux côtés", () => {
  const garage = vueDepuisDevisGarage({
    ...DEVIS_GARAGE,
    devis_lignes: [{ ...DEVIS_GARAGE.devis_lignes[1], inspection_point_id: "pt", note_constat: "Usées à 2 mm" }],
  }, "Garage Recette");
  assert.deepEqual(garage.lignes[0].preuve, { constat: "Usées à 2 mm", photos: [] });

  const publique = vueDepuisPagePublique({
    ...REPONSE_PUBLIQUE,
    lignes: [{ ...REPONSE_PUBLIQUE.lignes[0], preuve: { constat: "Usées à 2 mm", photos: ["g/i/a.png"] } }],
  });
  assert.deepEqual(publique.lignes[0].preuve, { constat: "Usées à 2 mm", photos: ["g/i/a.png"] });
});

test("une ligne sans constat n'a pas de preuve — jamais une photo inventée", () => {
  const v = vueDepuisPagePublique(REPONSE_PUBLIQUE);
  assert.equal(v.lignes[0].preuve, null);
});
