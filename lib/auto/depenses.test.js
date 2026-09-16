import assert from "node:assert/strict";
import test from "node:test";

import { resumerDepenses } from "./depenses.js";

const AUJOURDHUI = "2026-09-16";

test("aucune intervention : tout à zéro, rien d'inventé", () => {
  assert.deepEqual(resumerDepenses([], { aujourdhui: AUJOURDHUI }), {
    totalCentimes: 0,
    douzeMoisCentimes: 0,
    nombreAvecMontant: 0,
    nombreSansMontant: 0,
    parAnnee: [],
    parType: [],
    depuis: null,
  });
});

test("totaux en centimes, par année et par type", () => {
  const r = resumerDepenses(
    [
      { type: "revision", realise_le: "2025-10-01", montant_ttc: 189.9 },
      { type: "controle_technique", realise_le: "2025-04-30", montant_ttc: "79.00" },
      { type: "pneus", realise_le: "2026-03-12", montant_ttc: 0.1 },
      { type: "pneus", realise_le: "2026-03-12", montant_ttc: 0.2 },
      { type: "lavage", realise_le: "2026-08-01", montant_ttc: null },
      { type: "vidange", realise_le: "2024-02-10", montant_ttc: 95 },
    ],
    { aujourdhui: AUJOURDHUI },
  );
  // 0,10 + 0,20 donne bien 30 centimes, pas 0,30000000000000004.
  assert.equal(r.totalCentimes, 18990 + 7900 + 10 + 20 + 9500);
  assert.equal(r.douzeMoisCentimes, 18990 + 30);
  assert.equal(r.nombreAvecMontant, 5);
  assert.equal(r.nombreSansMontant, 1);
  assert.deepEqual(r.parAnnee, [
    { annee: 2026, totalCentimes: 30, nombre: 2 },
    { annee: 2025, totalCentimes: 26890, nombre: 2 },
    { annee: 2024, totalCentimes: 9500, nombre: 1 },
  ]);
  assert.deepEqual(r.parType.map((t) => t.type), ["revision", "vidange", "controle_technique", "pneus"]);
  assert.equal(r.depuis, "2024-02-10");
});

test("douze derniers mois : bornes exclusives au début, incluses aujourd'hui", () => {
  const r = resumerDepenses(
    [
      { type: "revision", realise_le: "2025-09-16", montant_ttc: 100 },
      { type: "revision", realise_le: "2025-09-17", montant_ttc: 10 },
      { type: "revision", realise_le: "2026-09-16", montant_ttc: 1 },
    ],
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(r.douzeMoisCentimes, 1100);
});

test("un montant négatif ou illisible ne compte pas", () => {
  const r = resumerDepenses(
    [
      { type: "autre", realise_le: "2026-01-01", montant_ttc: -5 },
      { type: "autre", realise_le: "2026-01-01", montant_ttc: "abc" },
      { type: "autre", realise_le: "2026-01-01", montant_ttc: "" },
    ],
    { aujourdhui: AUJOURDHUI },
  );
  assert.equal(r.nombreAvecMontant, 0);
  assert.equal(r.nombreSansMontant, 3);
});
