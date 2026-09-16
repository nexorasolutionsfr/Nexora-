import assert from "node:assert/strict";
import test from "node:test";

import {
  ajouterMois,
  dernierKilometrage,
  joursEntre,
  prochainControleTechnique,
  prochainEntretien,
} from "./echeances.js";

test("ajouterMois reste dans le mois visé", () => {
  assert.equal(ajouterMois("2024-02-29", 12), "2025-02-28");
  assert.equal(ajouterMois("2026-01-31", 1), "2026-02-28");
  assert.equal(ajouterMois("2026-03-15", -6), "2025-09-15");
  assert.equal(ajouterMois("2026-12-10", 2), "2027-02-10");
  assert.equal(ajouterMois("pas une date", 2), null);
});

test("joursEntre compte en jours calendaires, sans fuseau", () => {
  assert.equal(joursEntre("2026-03-29", "2026-03-30"), 1);
  assert.equal(joursEntre("2026-09-16", "2026-09-16"), 0);
  assert.equal(joursEntre("2026-09-16", "2026-09-10"), -6);
});

test("dernierKilometrage : le plus récent, relevé ou intervention", () => {
  assert.equal(dernierKilometrage({}), null);
  const r = dernierKilometrage({
    releves: [{ kilometrage: 60000, releve_le: "2026-06-01" }],
    historique: [
      { kilometrage: 61400, realise_le: "2026-09-01", type: "vidange" },
      { kilometrage: null, realise_le: "2026-09-10", type: "lavage" },
    ],
  });
  assert.deepEqual(r, { kilometrage: 61400, date: "2026-09-01", origine: "intervention" });
});

test("dernierKilometrage : à date égale, le plus élevé l'emporte", () => {
  const r = dernierKilometrage({
    releves: [
      { kilometrage: 61000, releve_le: "2026-09-01" },
      { kilometrage: 61400, releve_le: "2026-09-01" },
    ],
  });
  assert.equal(r.kilometrage, 61400);
});

test("CT : sans aucune date, on demande la mise en circulation", () => {
  assert.deepEqual(prochainControleTechnique({ aujourdhui: "2026-09-16" }), {
    etat: "a_renseigner",
    manque: "mise_en_circulation",
  });
});

test("CT : voiture de moins de 4 ans, premier contrôle au 4e anniversaire", () => {
  const ct = prochainControleTechnique({ dateMiseEnCirculation: "2023-03-12", aujourdhui: "2026-09-16" });
  assert.equal(ct.etat, "calcule");
  assert.equal(ct.source, "mise_en_circulation");
  assert.equal(ct.date, "2027-03-12");
  assert.equal(ct.fenetreOuverteLe, "2026-09-12");
  assert.equal(ct.joursRestants, 177);
  assert.equal(ct.niveau, "ok");
});

test("CT : voiture de plus de 4 ans sans dernier contrôle connu, on le demande", () => {
  assert.deepEqual(
    prochainControleTechnique({ dateMiseEnCirculation: "2019-03-12", aujourdhui: "2026-09-16" }),
    { etat: "a_renseigner", manque: "dernier_controle" },
  );
});

test("CT : sans procès-verbal, estimation à 2 ans du dernier contrôle, le plus récent faisant foi", () => {
  const ct = prochainControleTechnique({
    dateMiseEnCirculation: "2019-03-12",
    historique: [
      { type: "controle_technique", realise_le: "2023-02-20" },
      { type: "controle_technique", realise_le: "2025-03-01" },
      { type: "vidange", realise_le: "2026-01-10" },
    ],
    aujourdhui: "2026-09-16",
  });
  assert.equal(ct.source, "dernier_controle");
  assert.equal(ct.dernierLe, "2025-03-01");
  assert.equal(ct.date, "2027-03-01");
  assert.equal(ct.niveau, "ok");
});

test("CT : proche à moins de 60 jours, dépassé après la date", () => {
  const proche = prochainControleTechnique({
    historique: [{ type: "controle_technique", realise_le: "2024-10-20" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(proche.joursRestants, 34);
  assert.equal(proche.niveau, "proche");

  const depasse = prochainControleTechnique({
    historique: [{ type: "controle_technique", realise_le: "2024-08-01" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(depasse.niveau, "depasse");
  assert.ok(depasse.joursRestants < 0);
});

test("Entretien : sans intervalle du carnet, aucune échéance inventée", () => {
  assert.deepEqual(
    prochainEntretien({ historique: [{ type: "revision", realise_le: "2026-01-10", kilometrage: 50000 }], aujourdhui: "2026-09-16" }),
    { etat: "intervalle_a_renseigner" },
  );
});

test("Entretien : intervalle connu mais aucun entretien passé", () => {
  assert.deepEqual(
    prochainEntretien({ intervalleKm: 15000, intervalleMois: 12, historique: [{ type: "lavage", realise_le: "2026-01-10" }], aujourdhui: "2026-09-16" }),
    { etat: "dernier_entretien_a_renseigner" },
  );
});

test("Entretien : par kilomètres et par date, le plus urgent l'emporte", () => {
  const e = prochainEntretien({
    intervalleKm: 15000,
    intervalleMois: 12,
    historique: [{ type: "revision", realise_le: "2025-10-01", kilometrage: 47000 }],
    releves: [{ kilometrage: 61400, releve_le: "2026-09-12" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(e.etat, "calcule");
  assert.deepEqual(e.depuis, { date: "2025-10-01", kilometrage: 47000, type: "revision" });
  assert.deepEqual(e.parKm, { limite: 62000, restants: 600, niveau: "proche" });
  assert.equal(e.parDate.limite, "2026-10-01");
  assert.equal(e.parDate.niveau, "proche");
  assert.equal(e.niveau, "proche");
});

test("Entretien : une vidange ne remplace pas la révision", () => {
  const e = prochainEntretien({
    intervalleKm: 20000,
    historique: [
      { type: "revision", realise_le: "2024-05-01", kilometrage: 30000 },
      { type: "vidange", realise_le: "2026-02-01", kilometrage: 55000 },
    ],
    releves: [{ kilometrage: 61400, releve_le: "2026-09-12" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(e.depuis.type, "revision");
  assert.equal(e.source, "intervalle_renseigne");
  assert.deepEqual(e.intervalle, { km: 20000, mois: null });
  assert.deepEqual(e.parKm, { limite: 50000, restants: -11400, niveau: "depasse" });
  assert.equal(e.niveau, "depasse");

  assert.deepEqual(
    prochainEntretien({ intervalleKm: 15000, historique: [{ type: "vidange", realise_le: "2026-02-01", kilometrage: 55000 }], aujourdhui: "2026-09-16" }),
    { etat: "dernier_entretien_a_renseigner" },
  );
});

test("CT : la date du procès-verbal prime sur le calcul", () => {
  const ct = prochainControleTechnique({
    historique: [{ type: "controle_technique", realise_le: "2025-03-01", controle_valable_jusqu_au: "2027-02-28", resultat_controle: "favorable" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(ct.etat, "calcule");
  assert.equal(ct.source, "proces_verbal");
  assert.equal(ct.date, "2027-02-28");
  assert.equal(ct.dernierLe, "2025-03-01");
});

test("CT : une contre-visite ne donne jamais d'échéance à deux ans", () => {
  const ct = prochainControleTechnique({
    historique: [{ type: "controle_technique", realise_le: "2026-09-01", resultat_controle: "contre_visite" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(ct.etat, "contre_visite");
  assert.equal(ct.date, "2026-11-01");
  assert.equal(ct.niveau, "proche");
});

test("CT : après une contre-visite, sans procès-verbal, on demande la date officielle", () => {
  const apres = prochainControleTechnique({
    historique: [
      { type: "controle_technique", realise_le: "2026-07-01", resultat_controle: "contre_visite" },
      { type: "controle_technique", realise_le: "2026-08-10", resultat_controle: "favorable" },
    ],
    aujourdhui: "2026-09-16",
  });
  assert.deepEqual(apres, { etat: "a_renseigner", manque: "date_proces_verbal", dernierLe: "2026-08-10" });

  // Une contre-visite ancienne, suivie deux ans plus tard d'un contrôle
  // favorable, ne bloque plus l'estimation.
  const loin = prochainControleTechnique({
    historique: [
      { type: "controle_technique", realise_le: "2022-07-01", resultat_controle: "contre_visite" },
      { type: "controle_technique", realise_le: "2024-06-20", resultat_controle: "favorable" },
    ],
    aujourdhui: "2026-01-10",
  });
  assert.equal(loin.source, "dernier_controle");
  assert.equal(loin.date, "2026-06-20");
});

test("Entretien : un compteur relevé avant l'entretien ne dit rien de ce qui reste", () => {
  const e = prochainEntretien({
    intervalleKm: 15000,
    historique: [{ type: "revision", realise_le: "2026-09-01", kilometrage: 61000 }],
    releves: [{ kilometrage: 60000, releve_le: "2026-06-01" }],
    aujourdhui: "2026-09-16",
  });
  // Le dernier kilométrage connu est celui de la révision elle-même.
  assert.deepEqual(e.parKm, { limite: 76000, restants: 15000, niveau: "ok" });

  const sansKm = prochainEntretien({
    intervalleKm: 15000,
    historique: [{ type: "revision", realise_le: "2026-09-01" }],
    releves: [{ kilometrage: 60000, releve_le: "2026-06-01" }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(sansKm.parKm, undefined);
  assert.equal(sansKm.niveau, null);
});
