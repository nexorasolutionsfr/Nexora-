import assert from "node:assert/strict";
import test from "node:test";

import { estimerKilometrage, pointsKilometrage } from "./kilometrage.js";

test("points : relevés et interventions, le plus haut à date égale", () => {
  const points = pointsKilometrage({
    releves: [{ releve_le: "2026-09-01", kilometrage: 61000 }, { releve_le: "2026-09-01", kilometrage: 61400 }],
    historique: [{ realise_le: "2025-10-01", kilometrage: 47000 }, { realise_le: "2026-01-01", kilometrage: null }],
  });
  assert.deepEqual(points, [
    { date: "2025-10-01", kilometrage: 47000, origine: "intervention" },
    { date: "2026-09-01", kilometrage: 61400, origine: "releve" },
  ]);
});

test("aucun point : kilométrage inconnu", () => {
  assert.deepEqual(estimerKilometrage({ aujourdhui: "2026-09-16" }), { etat: "inconnu" });
});

test("relevé récent : pas d'estimation, le compteur suffit", () => {
  const r = estimerKilometrage({
    releves: [{ releve_le: "2026-09-10", kilometrage: 61400 }],
    historique: [{ realise_le: "2025-10-01", kilometrage: 47000 }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(r.joursDepuis, 6);
  assert.equal(r.ancien, false);
  assert.ok(r.parJour > 0);
  assert.equal(r.estimation, undefined);
});

test("relevé de plus de 14 jours : estimation séparée, arrondie à la centaine", () => {
  const r = estimerKilometrage({
    releves: [{ releve_le: "2026-01-01", kilometrage: 50000 }, { releve_le: "2026-07-01", kilometrage: 57240 }],
    aujourdhui: "2026-09-16",
  });
  // 7 240 km en 181 jours : 40 km par jour ; 77 jours plus tard, environ 3 080 km de plus.
  assert.equal(r.dernier.kilometrage, 57240);
  assert.equal(r.joursDepuis, 77);
  assert.equal(r.ancien, true);
  assert.equal(r.estimation.kilometrage, 60300);
});

test("pas d'estimation sans rythme fiable ni au-delà d'un an", () => {
  // Deux points trop proches.
  assert.equal(estimerKilometrage({ releves: [{ releve_le: "2026-06-01", kilometrage: 50000 }, { releve_le: "2026-06-10", kilometrage: 50500 }], aujourdhui: "2026-09-16" }).estimation, undefined);
  // Compteur qui recule : aucun rythme.
  assert.equal(estimerKilometrage({ releves: [{ releve_le: "2026-01-01", kilometrage: 60000 }, { releve_le: "2026-06-01", kilometrage: 50000 }], aujourdhui: "2026-09-16" }).parJour, undefined);
  // Dernier relevé de plus d'un an : on demande le compteur.
  const vieux = estimerKilometrage({ releves: [{ releve_le: "2024-01-01", kilometrage: 40000 }, { releve_le: "2025-06-01", kilometrage: 50000 }], aujourdhui: "2026-09-16" });
  assert.equal(vieux.ancien, true);
  assert.equal(vieux.estimation, undefined);
});
