import assert from "node:assert/strict";
import test from "node:test";

import { validerIntervalle, validerIntervention, validerReleve, validerVehicule } from "./validation.js";

const AUJOURDHUI = "2026-09-16";

test("véhicule : marque et modèle suffisent", () => {
  const r = validerVehicule({ marque: " Peugeot ", modele: "308 " }, { aujourdhui: AUJOURDHUI, creation: true });
  assert.equal(r.valide, true);
  assert.deepEqual(r.donnees, {
    marque: "Peugeot",
    modele: "308",
    annee: null,
    energie: null,
    immatriculation: null,
    dateMiseEnCirculation: null,
    kilometrage: null,
    dernierControle: null,
    controleValableJusquAu: null,
  });
});

test("véhicule : champs obligatoires et valeurs impossibles", () => {
  const r = validerVehicule(
    { marque: "  ", modele: "", annee: "3000", energie: "vapeur", immatriculation: "A", dateMiseEnCirculation: "2027-01-01", kilometrage: "beaucoup" },
    { aujourdhui: AUJOURDHUI, creation: true },
  );
  assert.equal(r.valide, false);
  assert.deepEqual(Object.keys(r.erreurs).sort(), ["annee", "dateMiseEnCirculation", "energie", "immatriculation", "kilometrage", "marque", "modele"]);
  assert.equal(r.erreurs.dateMiseEnCirculation, "La date ne peut pas être dans le futur.");
});

test("véhicule : plaque normalisée, format inhabituel seulement signalé", () => {
  const siv = validerVehicule({ marque: "Renault", modele: "Clio", immatriculation: "gh-456-jk" }, { aujourdhui: AUJOURDHUI });
  assert.equal(siv.donnees.immatriculation, "GH456JK");
  assert.deepEqual(siv.avertissements, {});

  const etrangere = validerVehicule({ marque: "VW", modele: "Golf", immatriculation: "B 1234 XY" }, { aujourdhui: AUJOURDHUI });
  assert.equal(etrangere.valide, true);
  assert.equal(etrangere.avertissements.immatriculation, "Format inhabituel : vérifiez la plaque.");
});

test("véhicule : le dernier contrôle ne précède pas la mise en circulation", () => {
  const r = validerVehicule(
    { marque: "Dacia", modele: "Sandero", dateMiseEnCirculation: "2020-05-02", dernierControle: "2019-01-01", kilometrage: "38 200" },
    { aujourdhui: AUJOURDHUI, creation: true },
  );
  assert.equal(r.erreurs.dernierControle, "Le contrôle ne peut pas précéder la mise en circulation.");
  assert.equal(r.donnees.kilometrage, 38200);
});

test("véhicule en modification : kilométrage et contrôle ne sont pas lus", () => {
  const r = validerVehicule({ marque: "Dacia", modele: "Sandero", kilometrage: "n'importe", dernierControle: "2099-01-01" }, { aujourdhui: AUJOURDHUI });
  assert.equal(r.valide, true);
  assert.equal("kilometrage" in r.donnees, false);
});

test("intervention : type et date obligatoires, montant à la française", () => {
  const vide = validerIntervention({}, { aujourdhui: AUJOURDHUI });
  assert.deepEqual(Object.keys(vide.erreurs).sort(), ["realiseLe", "type"]);

  const r = validerIntervention(
    { type: "revision", realiseLe: "2025-10-01", kilometrage: "47 000", montant: "189,90", prestataire: " Garage Martin ", libelle: "" },
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(r.valide, true);
  assert.deepEqual(r.donnees, {
    type: "revision",
    realiseLe: "2025-10-01",
    kilometrage: 47000,
    montantTtc: 189.9,
    prestataire: "Garage Martin",
    libelle: null,
    resultatControle: null,
    natureControle: null,
    controleValableJusquAu: null,
  });

  const montant = validerIntervention({ type: "pneus", realiseLe: "2026-09-01", montant: "gratuit" }, { aujourdhui: AUJOURDHUI });
  assert.equal(montant.erreurs.montant, "Ce montant n'est pas valide.");
});

test("relevé : kilométrage et date, jamais dans le futur", () => {
  assert.equal(validerReleve({ kilometrage: "61 400", releveLe: AUJOURDHUI }, { aujourdhui: AUJOURDHUI }).valide, true);
  const r = validerReleve({ kilometrage: "", releveLe: "2026-12-01" }, { aujourdhui: AUJOURDHUI });
  assert.deepEqual(Object.keys(r.erreurs).sort(), ["kilometrage", "releveLe"]);
});

test("intervalle : au moins un des deux, bornes du carnet", () => {
  assert.equal(validerIntervalle({}).valide, false);
  assert.deepEqual(validerIntervalle({ km: "15 000", mois: "12" }).donnees, { km: 15000, mois: 12 });
  assert.deepEqual(validerIntervalle({ mois: "24" }).donnees, { km: null, mois: 24 });
  const r = validerIntervalle({ km: "500", mois: "120" });
  assert.deepEqual(Object.keys(r.erreurs).sort(), ["km", "mois"]);
});

test("contrôle technique : résultat et date du procès-verbal", () => {
  const ok = validerIntervention(
    { type: "controle_technique", realiseLe: "2026-03-02", resultatControle: "favorable", controleValableJusquAu: "2028-03-02" },
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(ok.valide, true);
  assert.equal(ok.donnees.resultatControle, "favorable");
  assert.equal(ok.donnees.controleValableJusquAu, "2028-03-02");

  assert.equal(ok.donnees.natureControle, "periodique");

  const avant = validerIntervention({ type: "controle_technique", realiseLe: "2026-03-02", controleValableJusquAu: "2026-01-01" }, { aujourdhui: AUJOURDHUI });
  assert.equal(avant.erreurs.controleValableJusquAu, "Cette date ne peut pas précéder celle du contrôle.");

  // Défaillance critique : validité limitée au jour même, donc la même date est acceptée.
  const critique = validerIntervention(
    { type: "controle_technique", realiseLe: "2026-05-14", resultatControle: "defavorable_critique", controleValableJusquAu: "2026-05-14" },
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(critique.valide, true);

  const contreVisite = validerIntervention({ type: "controle_technique", realiseLe: "2026-06-20", natureControle: "contre_visite", resultatControle: "favorable" }, { aujourdhui: AUJOURDHUI });
  assert.equal(contreVisite.donnees.natureControle, "contre_visite");
  assert.equal(validerIntervention({ type: "controle_technique", realiseLe: "2026-06-20", resultatControle: "contre_visite" }, { aujourdhui: AUJOURDHUI }).erreurs.resultatControle, "Choisissez le résultat dans la liste.");

  // Sur une vidange, ces informations sont ignorées, jamais enregistrées.
  const vidange = validerIntervention({ type: "vidange", realiseLe: "2026-03-02", resultatControle: "favorable", controleValableJusquAu: "2028-03-02" }, { aujourdhui: AUJOURDHUI });
  assert.equal(vidange.donnees.resultatControle, null);
  assert.equal(vidange.donnees.natureControle, null);
  assert.equal(vidange.donnees.controleValableJusquAu, null);

  const vehicule = validerVehicule({ marque: "Toyota", modele: "Yaris", controleValableJusquAu: "2028-03-02" }, { aujourdhui: AUJOURDHUI, creation: true });
  assert.equal(vehicule.erreurs.dernierControle, "Indiquez aussi la date du contrôle.");
});
