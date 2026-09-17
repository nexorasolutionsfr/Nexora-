import assert from "node:assert/strict";
import test from "node:test";

import {
  ajouterMois,
  dateLimiteValidite,
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

// Contrôle technique : exemples de service-public.fr (F2878), relus le 16 sept. 2026.
const ct = (realise_le, extra = {}) => ({ type: "controle_technique", realise_le, ...extra });

test("dateLimiteValidite : la veille du même quantième, ou la fin du mois", () => {
  assert.equal(dateLimiteValidite("2025-05-14", 24), "2027-05-13");
  assert.equal(dateLimiteValidite("2026-05-14", 2), "2026-07-13");
  assert.equal(dateLimiteValidite("2026-06-05", 24), "2028-06-04");
  assert.equal(dateLimiteValidite("2022-10-01", 48), "2026-09-30");
  assert.equal(dateLimiteValidite("2024-02-29", 24), "2026-02-28");
  assert.equal(dateLimiteValidite("2025-12-31", 2), "2026-02-28");
});

test("CT : sans aucune date, on demande la mise en circulation", () => {
  assert.deepEqual(prochainControleTechnique({ aujourdhui: "2026-09-16" }), { etat: "a_renseigner", manque: "mise_en_circulation" });
});

test("CT : premier contrôle dans les 6 mois avant le 4e anniversaire", () => {
  const r = prochainControleTechnique({ dateMiseEnCirculation: "2022-10-01", aujourdhui: "2026-03-01" });
  assert.equal(r.etat, "calcule");
  assert.equal(r.source, "mise_en_circulation");
  assert.equal(r.fondement, "calcul");
  assert.equal(r.fenetreOuverteLe, "2026-04-01");
  assert.equal(r.date, "2026-09-30");
});

test("CT : voiture de plus de 4 ans sans contrôle connu, on le demande", () => {
  assert.deepEqual(prochainControleTechnique({ dateMiseEnCirculation: "2019-03-12", aujourdhui: "2026-09-16" }), {
    etat: "a_renseigner",
    manque: "dernier_controle",
  });
});

test("CT : favorable, valable 2 ans jusqu'à la veille", () => {
  const r = prochainControleTechnique({ historique: [ct("2023-05-10"), ct("2025-05-14", { resultat_controle: "favorable" }), { type: "vidange", realise_le: "2026-01-10" }], aujourdhui: "2026-09-16" });
  assert.equal(r.source, "dernier_controle");
  assert.equal(r.fondement, "calcul");
  assert.equal(r.date, "2027-05-13");
  assert.equal(r.niveau, "ok");
});

test("CT : la date du procès-verbal prime", () => {
  const r = prochainControleTechnique({ historique: [ct("2025-05-14", { controle_valable_jusqu_au: "2027-05-12" })], aujourdhui: "2026-09-16" });
  assert.equal(r.source, "proces_verbal");
  assert.equal(r.fondement, "officiel");
  assert.equal(r.date, "2027-05-12");
});

test("CT : défaillance majeure, valable 2 mois, contre-visite avant la même date", () => {
  const r = prochainControleTechnique({ historique: [ct("2026-05-14", { resultat_controle: "defavorable_majeure" })], aujourdhui: "2026-06-01" });
  assert.equal(r.etat, "contre_visite");
  assert.equal(r.resultat, "defavorable_majeure");
  assert.equal(r.date, "2026-07-13");
  assert.equal(r.valableJusquAu, "2026-07-13");
  assert.equal(r.fondement, "calcul");
  assert.equal(r.niveau, "proche");
});

test("CT : défaillance critique, validité limitée au jour même, contre-visite dans les 2 mois", () => {
  const r = prochainControleTechnique({ historique: [ct("2026-05-14", { resultat_controle: "defavorable_critique" })], aujourdhui: "2026-05-20" });
  assert.equal(r.etat, "contre_visite");
  assert.equal(r.valableJusquAu, "2026-05-14");
  assert.equal(r.date, "2026-07-13");
});

test("CT : contre-visite favorable, 2 ans à compter du contrôle initial", () => {
  const r = prochainControleTechnique({
    historique: [ct("2026-06-05", { resultat_controle: "defavorable_majeure" }), ct("2026-06-20", { nature_controle: "contre_visite", resultat_controle: "favorable" })],
    aujourdhui: "2026-09-16",
  });
  assert.equal(r.source, "contre_visite_favorable");
  assert.equal(r.initialLe, "2026-06-05");
  assert.equal(r.date, "2028-06-04");
});

test("CT : contre-visite défavorable, le délai court toujours depuis le contrôle initial", () => {
  const r = prochainControleTechnique({
    historique: [ct("2026-06-05", { resultat_controle: "defavorable_critique" }), ct("2026-07-01", { nature_controle: "contre_visite", resultat_controle: "defavorable_majeure" })],
    aujourdhui: "2026-07-02",
  });
  assert.equal(r.etat, "contre_visite");
  assert.equal(r.initialLe, "2026-06-05");
  assert.equal(r.date, "2026-08-04");
});

test("CT : sans contrôle initial retrouvé, ou contrôle ambigu, on demande le procès-verbal", () => {
  assert.equal(
    prochainControleTechnique({ historique: [ct("2026-06-20", { nature_controle: "contre_visite", resultat_controle: "favorable" })], aujourdhui: "2026-09-16" }).manque,
    "date_proces_verbal",
  );
  // Un contrôle dit « périodique » dans le délai de contre-visite d'un contrôle défavorable.
  assert.equal(
    prochainControleTechnique({ historique: [ct("2026-06-05", { resultat_controle: "defavorable_majeure" }), ct("2026-06-25", { resultat_controle: "favorable" })], aujourdhui: "2026-09-16" }).manque,
    "date_proces_verbal",
  );
  // Un contrôle défavorable ancien ne bloque pas un contrôle favorable deux ans plus tard.
  const loin = prochainControleTechnique({ historique: [ct("2022-07-01", { resultat_controle: "defavorable_majeure" }), ct("2024-06-20", { resultat_controle: "favorable" })], aujourdhui: "2026-01-10" });
  assert.equal(loin.source, "dernier_controle");
  assert.equal(loin.date, "2026-06-19");
});

test("CT : proche à moins de 60 jours, dépassé après la date", () => {
  const proche = prochainControleTechnique({ historique: [ct("2024-10-20")], aujourdhui: "2026-09-16" });
  assert.equal(proche.date, "2026-10-19");
  assert.equal(proche.joursRestants, 33);
  assert.equal(proche.niveau, "proche");
  const depasse = prochainControleTechnique({ historique: [ct("2024-08-01")], aujourdhui: "2026-09-16" });
  assert.equal(depasse.niveau, "depasse");
});
