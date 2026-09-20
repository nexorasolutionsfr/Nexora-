import assert from "node:assert/strict";
import test from "node:test";

import { connaissancesDe, programmePour, referenceDe } from "./moteur.js";
import { SOURCES } from "./sources.js";

const voiture = (p = {}) => ({ marque: "Peugeot", modele: "208", energie: "essence", date_mise_en_circulation: "2021-04-12", ...p });

const FICHE_208 = {
  id: 1,
  sous_categorie_produit: "automobiles, motos, scooters",
  date_publication: "2026-08-03T00:00:00+00:00",
  marque_produit: "peugeot",
  modeles_ou_references: "208 v2 voiture de tourisme. niv : vr3uphnkxr5176395 - vr3uphpy3t500016",
  identification_produits: ["01.02.2020 - 09.07.2025"],
  motif_rappel: "un défaut d'assemblage…",
  lien_vers_la_fiche_rappel: "https://rappel.conso.gouv.fr/fiche-rappel/1/rapex",
};

const lues = (fiches = [FICHE_208]) => ({ etat: "lues", fiches, total: fiches.length, tronque: false });
const trouver = (r, cle) => r.connaissances.find((c) => c.cle === cle);

test("une voiture renseignée : la classe Crit'Air est établie et sourcée", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const critair = trouver(r, "critair");
  assert.equal(critair.etat, "applicable");
  assert.equal(critair.valeur.classe, "1");
  assert.equal(critair.source, "arrete-2016-06-21-critair");
  assert.equal(referenceDe(critair).editeur, SOURCES["arrete-2016-06-21-critair"].editeur);
  assert.ok(critair.faitsUtilises.some((f) => f.cle === "date_mise_en_circulation"));
});

test("une campagne qui nomme le modèle : à vérifier, jamais « votre voiture est rappelée »", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues(), aujourdhui: "2026-09-20" });
  const c = trouver(r, "campagnes_rappel");
  assert.equal(c.etat, "a_verifier");
  assert.equal(c.valeur.retenues.length, 1);
  // La phrase reste conditionnelle : « peut dire SI votre voiture est
  // concernée », jamais « votre voiture est concernée ».
  assert.ok(c.resume.includes("Seul le constructeur peut dire si"), c.resume);
  assert.ok(!/^votre voiture/i.test(c.resume), c.resume);
  assert.notEqual(c.etat, "applicable", "une campagne ne devient jamais un fait établi sur CETTE voiture");
  // La date de la base (colonne_en_base) doit atteindre le calcul de période.
  assert.equal(c.valeur.retenues[0].situation, "compatible", "la date de mise en circulation doit être lue");
  assert.equal(r.aVerifier.length, 1);
  // Ce qui doit vraiment se voir en premier : la sécurité avant le reste.
  assert.equal(r.connaissances[0].cle, "campagnes_rappel");
});

test("base des rappels injoignable : « rien n'est affirmé », et non « aucune campagne »", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: { etat: "indisponible", raison: "injoignable" }, aujourdhui: "2026-09-20" });
  const c = trouver(r, "campagnes_rappel");
  assert.equal(c.etat, "indisponible");
  assert.ok(c.resume.includes("Rien n'est affirmé"));
  assert.ok(c.lien.url.startsWith("https://rappel.conso.gouv.fr"));
  // Le reste de la page continue de fonctionner.
  assert.equal(trouver(r, "critair").etat, "applicable");
});

test("campagnes non consultées : même prudence qu'une panne, pas un silence", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: null, aujourdhui: "2026-09-20" });
  assert.equal(trouver(r, "campagnes_rappel").etat, "indisponible");
});

test("aucune campagne pour ce modèle : l'absence n'est pas présentée comme une garantie", () => {
  const r = connaissancesDe({ vehicule: voiture({ modele: "Qashqai", marque: "Nissan" }), campagnes: lues(), aujourdhui: "2026-09-20" });
  const c = trouver(r, "campagnes_rappel");
  assert.equal(c.etat, "non_applicable");
  assert.ok(c.limites.some((l) => l.includes("n'est pas une garantie")));
});

test("le programme d'entretien dit qu'il est indisponible, et pourquoi", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.equal(p.etat, "indisponible");
  assert.equal(p.raison, "aucune_source_autorisee");
  assert.ok(p.resume.includes("carnet d'entretien"));
  assert.ok(p.limites.some((l) => l.includes("motorisation")));
  assert.equal(p.valeur, undefined, "aucun intervalle n'est proposé");
});

test("un programme documenté, quand il en existera un, passe par une variante et sa source", () => {
  // Pas de source autorisée aujourd'hui : on vérifie le CHEMIN, avec un
  // programme fictif injecté. Ce test ne prouve aucune disponibilité réelle.
  const programmes = {
    essai_variante: { source: "service-public-F2878", resume: "Révision tous les 20 000 km ou 1 an.", intervalle_km: 20000, intervalle_mois: 12, limites: ["Cas d'essai"] },
  };
  const sans = connaissancesDe({ vehicule: voiture(), campagnes: lues([]), programmes, aujourdhui: "2026-09-20" });
  assert.equal(trouver(sans, "programme_entretien").etat, "indisponible", "sans variante, rien");

  const avec = connaissancesDe({ vehicule: voiture({ variante: "essai_variante" }), campagnes: lues([]), programmes, aujourdhui: "2026-09-20" });
  const p = trouver(avec, "programme_entretien");
  assert.equal(p.etat, "applicable");
  assert.equal(p.valeur.intervalleKm, 20000);
  assert.equal(p.source, "service-public-F2878");
  assert.equal(programmePour(voiture({ variante: "inconnue" }), programmes), null);
});

test("une source non relue depuis plus d'un an cesse d'affirmer", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues(), aujourdhui: "2030-01-01" });
  assert.deepEqual(r.sourcesARelire.sort(), Object.keys(SOURCES).sort());
  assert.equal(trouver(r, "critair").etat, "source_a_relire");
  assert.equal(trouver(r, "critair").valeur, null);
  assert.equal(trouver(r, "campagnes_rappel").etat, "source_a_relire");
  assert.equal(r.aVerifier.length, 0);
});

test("ce qui manque est dit une fois, avec le geste qui le comble", () => {
  const r = connaissancesDe({ vehicule: { marque: "Peugeot", modele: "208" }, campagnes: lues([]), aujourdhui: "2026-09-20" });
  const critair = trouver(r, "critair");
  assert.equal(critair.etat, "donnees_insuffisantes");
  assert.deepEqual(r.manques.map((m) => m.cle), ["energie", "date_mise_en_circulation"]);
  assert.ok(r.manques.every((m) => m.geste && m.action));
});

test("une hybride non rechargeable : les deux réponses, plutôt qu'une question de plus", () => {
  const r = connaissancesDe({ vehicule: voiture({ energie: "hybride" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const critair = trouver(r, "critair");
  assert.equal(critair.etat, "donnees_insuffisantes");
  assert.deepEqual(critair.alternatives, [
    { carburant: "essence", classe: "1", libelle: "Crit'Air 1" },
    { carburant: "diesel", classe: "2", libelle: "Crit'Air 2" },
  ]);
  assert.equal(critair.valeur, undefined, "aucune classe n'est affirmée");
  assert.deepEqual(r.manques.map((m) => m.cle), ["carburant_hybride"]);
});

test("sans voiture, le moteur ne rend rien plutôt que des généralités", () => {
  assert.deepEqual(connaissancesDe({}), { connaissances: [], aVerifier: [], manques: [], sourcesARelire: [] });
});

test("les mêmes faits rendent toujours le même résultat", () => {
  const a = connaissancesDe({ vehicule: voiture(), campagnes: lues(), aujourdhui: "2026-09-20" });
  const b = connaissancesDe({ vehicule: voiture(), campagnes: lues(), aujourdhui: "2026-09-20" });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test("aucune connaissance n'invente une huile, une pression ou une distribution", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues(), aujourdhui: "2026-09-20" });
  const texte = JSON.stringify(r).toLowerCase();
  for (const interdit of ["5w30", "5w-30", "bar de pression", "courroie de distribution tous les", "litres d'huile"]) {
    assert.ok(!texte.includes(interdit), interdit);
  }
});
