import assert from "node:assert/strict";
import test from "node:test";

import { estimerKilometrage, incoherencesDuKilometrage, lignesKilometrage, pointsKilometrage } from "./kilometrage.js";

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

test("lignes : chaque kilométrage enregistré, avec sa source, du plus récent au plus ancien", () => {
  const lignes = lignesKilometrage({
    releves: [{ id: "r1", releve_le: "2026-09-01", kilometrage: 61400, source: "proprietaire" }, { id: "r2", releve_le: "2026-03-01", kilometrage: 52000, source: "prestation" }],
    historique: [{ id: "h1", type: "vidange", realise_le: "2025-10-01", kilometrage: 47000 }, { id: "h2", realise_le: "2026-01-01", kilometrage: null }],
  });
  assert.deepEqual(lignes.map((l) => [l.cle, l.origine, l.kilometrage]), [["releve:r1", "releve", 61400], ["releve:r2", "prestation", 52000], ["intervention:h1", "intervention", 47000]]);
  assert.equal(lignes[2].type, "vidange");
});

test("incohérences : compteur qui recule, rythme impossible, jamais corrigés", () => {
  // Faute de frappe : 123 400 saisi 1 234 000.
  const releves = [
    { id: "a", releve_le: "2026-01-10", kilometrage: 120000 },
    { id: "b", releve_le: "2026-03-10", kilometrage: 1234000 },
    { id: "c", releve_le: "2026-06-10", kilometrage: 126500 },
  ];
  const inc = incoherencesDuKilometrage({ releves });
  assert.deepEqual(inc.map((i) => [i.avant.releveId, i.apres.releveId, i.motif]), [["a", "b", "rythme"], ["b", "c", "recul"]]);
  // Même jour : deux compteurs voisins ne se contredisent pas ; très éloignés, si.
  assert.deepEqual(incoherencesDuKilometrage({ releves: [{ id: "x", releve_le: "2026-01-10", kilometrage: 50010 }], historique: [{ id: "y", realise_le: "2026-01-10", kilometrage: 50000 }] }), []);
  assert.deepEqual(
    incoherencesDuKilometrage({ releves: [{ id: "x", releve_le: "2026-09-17", kilometrage: 2340 }, { id: "z", releve_le: "2026-09-17", kilometrage: 23400 }] }).map((i) => i.motif),
    ["meme_jour"],
  );
  // Rythme soutenu mais possible.
  assert.deepEqual(incoherencesDuKilometrage({ releves: [{ id: "p", releve_le: "2026-01-01", kilometrage: 10000 }, { id: "q", releve_le: "2026-01-11", kilometrage: 18000 }] }), []);
});

test("estimation suspendue tant que des kilométrages se contredisent", () => {
  const r = estimerKilometrage({
    releves: [{ id: "a", releve_le: "2026-01-01", kilometrage: 50000 }, { id: "b", releve_le: "2026-04-01", kilometrage: 5600 }],
    historique: [{ id: "h", realise_le: "2025-06-01", kilometrage: 42000 }],
    aujourdhui: "2026-09-16",
  });
  assert.equal(r.aVerifier, true);
  assert.equal(r.estimation, undefined);
  assert.equal(r.parJour, undefined);
  assert.equal(r.incoherences.length, 1);
  // Le dernier compteur reste celui enregistré : rien n'est remplacé.
  assert.equal(r.dernier.kilometrage, 5600);
});
