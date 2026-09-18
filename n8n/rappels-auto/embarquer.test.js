import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { embarquer, modulesDe } from "./embarquer.mjs";
import { planifierRappels } from "../../lib/auto/rappels.js";

// Des dossiers qui couvrent chaque branche : déclarée, lue, calculée, premier
// contrôle, contre-visite, dépassée, inconnue.
const ct = (extra) => ({ type: "controle_technique", realise_le: "2026-06-19", nature_controle: "periodique", resultat_controle: "favorable", ...extra });
const voiture = (extra = {}) => ({ id: "v1", marque: "Opel", modele: "Corsa", immatriculation: "AB123CD", date_mise_en_circulation: "2014-05-20", ...extra });
const DOSSIERS = [
  { abonnement_id: "a1", delai_jours: 30, vehicule: voiture(), historique: [ct({ controle_valable_jusqu_au: "2028-06-18", source: "proprietaire" })], empreinte: "e1", url_base: "https://nexora-garage.vercel.app" },
  { abonnement_id: "a2", delai_jours: 60, vehicule: voiture({ id: "v2" }), historique: [ct({ controle_valable_jusqu_au: "2028-06-18", source: "prestation" })], empreinte: "e2", url_base: "http://localhost:3114" },
  { abonnement_id: "a3", delai_jours: 15, vehicule: voiture({ id: "v3", immatriculation: null }), historique: [ct({ source: "proprietaire" })], empreinte: "e3", url_base: "https://x.test/" },
  { abonnement_id: "a4", delai_jours: 30, vehicule: voiture({ id: "v4", date_mise_en_circulation: "2024-05-20" }), historique: [], empreinte: "e4", url_base: "https://x.test" },
  { abonnement_id: "a5", delai_jours: 30, vehicule: voiture({ id: "v5" }), historique: [ct({ realise_le: "2026-09-01", resultat_controle: "defavorable_majeure" })], empreinte: "e5", url_base: "https://x.test" },
  { abonnement_id: "a6", delai_jours: 30, vehicule: voiture({ id: "v6" }), historique: [ct({ realise_le: "2024-09-01", controle_valable_jusqu_au: "2026-09-10" })], empreinte: "e6", url_base: "https://x.test" },
  { abonnement_id: "a7", delai_jours: 30, vehicule: voiture({ id: "v7", date_mise_en_circulation: null }), historique: [], empreinte: "e7", url_base: "https://x.test" },
];

function executerEmbarque(dossiers, maintenant) {
  // Un contexte neuf, comme le nœud Code : aucun module du dépôt n'y est
  // chargé, seulement le script construit.
  const contexte = vm.createContext({ Intl, Date, JSON });
  vm.runInContext(embarquer(), contexte);
  contexte.__entree = { dossiers, maintenant };
  return vm.runInContext("__module('lib/auto/rappels.js').planifierRappels(__entree.dossiers, { maintenant: new Date(__entree.maintenant) })", contexte);
}

test("le script embarqué rend exactement ce que rend le module du dépôt", () => {
  for (const instant of ["2026-09-18T07:00:00Z", "2026-10-24T22:30:00Z", "2027-11-01T09:00:00Z"]) {
    const attendu = planifierRappels(DOSSIERS, { maintenant: new Date(instant) });
    const obtenu = JSON.parse(JSON.stringify(executerEmbarque(DOSSIERS, instant)));
    assert.deepEqual(obtenu, attendu, `écart à ${instant}`);
  }
});

test("il embarque les règles de l'écran, pas une copie", () => {
  const modules = modulesDe().map((m) => m.split("/").slice(-3).join("/"));
  for (const attendu of ["lib/auto/echeances.js", "auto/aPrevoir.js", "lib/auto/rappels.js", "lib/auto/immatriculation.js"]) {
    assert.ok(modules.some((m) => m.endsWith(attendu)), `${attendu} absent du script embarqué`);
  }
  // Les dépendances avant ce qui les utilise.
  assert.ok(modules.indexOf(modules.find((m) => m.endsWith("echeances.js"))) < modules.indexOf(modules.find((m) => m.endsWith("rappels.js"))));
});

test("chaque module garde sa portée : deux noms internes identiques ne se gênent pas", () => {
  const script = embarquer();
  // Plusieurs fichiers déclarent des fonctions internes homonymes (versDate…) :
  // si les portées se mélangeaient, l'évaluation échouerait.
  assert.doesNotThrow(() => vm.runInContext(script, vm.createContext({ Intl, Date, JSON })));
  assert.doesNotMatch(script, /^export /m, "plus aucun export à plat");
  assert.doesNotMatch(script, /^import /m, "plus aucun import à plat");
});
