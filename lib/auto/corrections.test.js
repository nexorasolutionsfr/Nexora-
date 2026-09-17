import assert from "node:assert/strict";
import test from "node:test";

import { avecOperations, colonnesModifiees, donneesCorrection, saisieDepuisIntervention, signalementsCorrection } from "./corrections.js";
import { validerIntervention } from "../../components/auto/validation.js";

const aujourdhui = "2026-09-17";
const facture = {
  id: "h-1",
  type: "vidange",
  realise_le: "2026-03-12",
  kilometrage: 84200,
  prestataire: "Garage fictif",
  montant_ttc: "189.90",
  libelle: "Vidange moteur ; Filtre à huile",
  saisie: "document",
  source: "proprietaire",
  operations: [
    { type: "vidange", libelle: "Vidange moteur" },
    { type: "autre", libelle: "Filtre à huile" },
  ],
  resultat_controle: null,
  nature_controle: null,
  controle_valable_jusqu_au: null,
};

function corriger(ligne, changements, operations) {
  const saisie = { ...saisieDepuisIntervention(ligne), ...changements };
  const v = validerIntervention(saisie, { aujourdhui });
  assert.equal(v.valide, true, JSON.stringify(v.erreurs));
  return donneesCorrection(ligne, v.donnees, operations ?? saisie.operations);
}

test("saisieDepuisIntervention : une ligne relue telle quelle ne change rien", () => {
  const s = saisieDepuisIntervention(facture);
  assert.equal(s.montant, "189,90");
  assert.equal(s.kilometrage, "84200");
  assert.deepEqual(colonnesModifiees(facture, corriger(facture, {})), []);
  const manuelle = { id: "h-2", type: "controle_technique", realise_le: "2025-05-02", kilometrage: null, prestataire: null, montant_ttc: null, libelle: null, saisie: "manuelle", operations: null, resultat_controle: null, nature_controle: null, controle_valable_jusqu_au: "2027-05-01" };
  assert.deepEqual(colonnesModifiees(manuelle, corriger(manuelle, {})), []);
});

test("corriger date, montant, professionnel, kilométrage : seules ces colonnes changent", () => {
  const colonnes = corriger(facture, { realiseLe: "2026-03-11", montant: "198,90", prestataire: "Garage fictif Nord", kilometrage: "84 020" });
  assert.deepEqual(colonnesModifiees(facture, colonnes).sort(), ["kilometrage", "montant_ttc", "prestataire", "realise_le"]);
  assert.equal(colonnes.montant_ttc, 198.9);
  assert.equal(colonnes.kilometrage, 84020);
});

test("corriger les opérations : le détail suit, le montant reste unique", () => {
  const ops = [{ type: "vidange", libelle: "Vidange moteur" }, { type: "freinage", libelle: " Plaquettes  avant " }, { type: "autre", libelle: "   " }];
  const colonnes = corriger(facture, {}, ops);
  assert.deepEqual(colonnes.operations, [{ type: "vidange", libelle: "Vidange moteur" }, { type: "freinage", libelle: "Plaquettes avant" }]);
  assert.equal(colonnes.libelle, "Vidange moteur ; Plaquettes avant");
  assert.deepEqual(colonnesModifiees(facture, colonnes).sort(), ["libelle", "operations"]);
  assert.equal(colonnes.montant_ttc, 189.9);
  // Toutes retirées : plus d'opérations, plus de détail (la base refuse une liste vide).
  const vide = corriger(facture, {}, []);
  assert.equal(vide.operations, null);
  assert.equal(vide.libelle, null);
});

test("une saisie manuelle sans opérations garde son détail libre", () => {
  const manuelle = { ...facture, id: "h-3", saisie: "manuelle", operations: null, libelle: "Pneus hiver" };
  assert.equal(avecOperations(manuelle), false);
  const colonnes = corriger(manuelle, { libelle: "Pneus hiver montés" });
  assert.equal("operations" in colonnes, false);
  assert.equal(colonnes.libelle, "Pneus hiver montés");
});

test("contrôle technique : nature non précisée conservée ; changer de type efface les champs du contrôle", () => {
  const ct = { ...facture, id: "h-4", type: "controle_technique", saisie: "manuelle", operations: null, resultat_controle: "favorable", nature_controle: null, controle_valable_jusqu_au: "2028-03-11" };
  assert.equal(corriger(ct, {}).nature_controle, null);
  assert.equal(corriger(ct, { natureControle: "contre_visite" }).nature_controle, "contre_visite");
  const devenue = corriger(ct, { type: "revision" });
  assert.equal(devenue.resultat_controle, null);
  assert.equal(devenue.controle_valable_jusqu_au, null);
  assert.equal(devenue.nature_controle, null);
});

test("signalements : ressemblance et kilométrage, sans compter la ligne elle-même", () => {
  const autre = { id: "h-9", type: "revision", realise_le: "2026-03-11", montant_ttc: "198.90", kilometrage: 90000 };
  const historique = [facture, autre];
  const colonnes = corriger(facture, { realiseLe: "2026-03-11", montant: "198,90" });
  const s = signalementsCorrection(facture, colonnes, { historique, releves: [{ kilometrage: 85000, releve_le: "2026-01-01" }] });
  assert.deepEqual(s.ressemblantes.map((h) => h.id), ["h-9"]);
  assert.deepEqual(s.incoherencesKm.map((p) => p.kilometrage), [85000]);
  const seule = signalementsCorrection(facture, corriger(facture, {}), { historique: [facture], releves: [] });
  assert.deepEqual(seule, { ressemblantes: [], incoherencesKm: [] });
});
