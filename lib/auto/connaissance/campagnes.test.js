import assert from "node:assert/strict";
import test from "node:test";

import { campagnesPour, lirePeriode, memeMarque, mentionneModele, modeleVoisin, situerDansLaPeriode } from "./campagnes.js";

// Fiches recopiées de la base officielle le 20 septembre 2026 (catégorie
// « automobiles et moyens de déplacement »), réduites aux champs utilisés.
// Elles servent de cas de référence : les formats bizarres viennent du réel,
// pas de notre imagination.
const fiche = (p) => ({
  sous_categorie_produit: "automobiles, motos, scooters",
  date_publication: "2026-08-05T09:34:23+00:00",
  numero_fiche: "2026-08-0001",
  lien_vers_la_fiche_rappel: "https://rappel.conso.gouv.fr/fiche-rappel/49909/rapex",
  ...p,
});

const NISSAN_QASHQAI = fiche({
  id: 49909,
  marque_produit: "nissan",
  modeles_ou_references: "qashqai voiture de tourisme.",
  identification_produits: ["04.05.2021 - 17.10.2024"],
  motif_rappel: "pendant le fonctionnement du moteur, la conduite de carburant peut se déplacer…",
});

const BMW_SERIES = fiche({
  id: 49890,
  marque_produit: "bmw",
  modeles_ou_references: "série 1 (e81  e82  e87  e88) - série 3 (e90  e91  e92  e93) voiture de tourisme, équipée d'airbags takata.",
  identification_produits: ["01.2011 - 06.2015"],
});

const CITROEN_C3_AIRCROSS = fiche({
  id: 49800,
  marque_produit: "citroen",
  modeles_ou_references: "c3 aircross v3 : 24.02.2025 - 21.05.2025",
  identification_produits: ["c3 aircross v3 : 24.02.2025 - 21.05.2025\nc3 v5: 21.02.2025 - 21.05.2025"],
});

const RENAULT_TRUCKS = fiche({
  id: 49700,
  marque_produit: "renault trucks",
  modeles_ou_references: "clio un camion.",
  identification_produits: ["01.01.2020 - 01.01.2021"],
});

const ACCESSOIRE = fiche({
  id: 49600,
  sous_categorie_produit: "tous types d'accessoires",
  marque_produit: "peugeot",
  modeles_ou_references: "208 tapis de sol",
  identification_produits: ["01.01.2020 - 01.01.2021"],
});

test("la marque : les sous-marques ne se confondent pas avec la gamme de tourisme", () => {
  assert.ok(memeMarque("Peugeot", "peugeot"));
  assert.ok(memeMarque("Citroën", "citroen"), "les accents ne doivent pas faire rater une fiche");
  assert.ok(memeMarque("Opel", "opel/vauxhall"));
  assert.ok(memeMarque("DS", "ds automobiles"));
  assert.ok(!memeMarque("Renault", "renault trucks"), "un camion n'est pas une Renault de tourisme");
  assert.ok(!memeMarque("Fiat", "fiat professional"));
  assert.ok(!memeMarque("Peugeot", "citroen"));
  assert.ok(!memeMarque("", "peugeot"));
});

test("le modèle : un mot entier, jamais un morceau de nombre", () => {
  assert.ok(mentionneModele("208 voiture de tourisme.", "208"));
  assert.ok(!mentionneModele("2008 voiture de tourisme.", "208"), "une 2008 n'est pas une 208");
  assert.ok(!mentionneModele("308 voiture de tourisme.", "208"));
  assert.ok(mentionneModele("série 1 (e81  e82) - série 3 (e90)", "e90"));
  assert.ok(!mentionneModele("cliox voiture", "clio"));
  assert.ok(mentionneModele("clio, un véhicule.", "Clio"));
});

test("un modèle voisin est signalé, pas masqué", () => {
  assert.ok(modeleVoisin("c3 aircross v3 : rappel", "c3"), "« c3 aircross » n'est pas une « c3 »");
  assert.ok(!modeleVoisin("qashqai voiture de tourisme.", "qashqai"), "« voiture » ne désigne pas un autre modèle");
  assert.ok(!modeleVoisin("208 voiture de tourisme.", "208"));
  // Relevé dans les fiches réelles du 20 septembre 2026 : la DGCCRF numérote
  // les générations. « 208 v2 » reste une 208.
  assert.ok(!modeleVoisin("208 v2 voiture de tourisme. niv : vr3uphnkxr5176395", "208"));
  assert.ok(!modeleVoisin("boxer ng véhicule utilitaire léger.", "boxer"));
  assert.ok(modeleVoisin("208 v2, 2008 v2 voiture de tourisme.", "2008") === false, "le modèle est en fin d'énumération");
});

test("la période se lit dans les formats réellement publiés", () => {
  assert.deepEqual(lirePeriode(["25.03.2014 - 26.08.2020"]), { debut: "2014-03-25", fin: "2020-08-26" });
  assert.deepEqual(lirePeriode(["01.2011 - 06.2015"]), { debut: "2011-01-01", fin: "2015-06-30" });
  assert.deepEqual(lirePeriode(["06.06.2025 – 22.01.2026"]), { debut: "2025-06-06", fin: "2026-01-22" }, "le tiret long existe dans les données");
  assert.deepEqual(lirePeriode(["1.10.2025 - 10.12.2025"]), { debut: "2025-10-01", fin: "2025-12-10" }, "un jour sur un seul chiffre");
  assert.deepEqual(lirePeriode(["c3 aircross v3 : 24.02.2025 - 21.05.2025\nc3 v5: 21.02.2025 - 21.05.2025"]), { debut: "2025-02-21", fin: "2025-05-21" });
  assert.equal(lirePeriode([]), null);
  assert.equal(lirePeriode(undefined), null);
});

test("la période de fabrication n'exclut pas une immatriculation des mois suivants", () => {
  const p = { debut: "2021-05-04", fin: "2024-10-17" };
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2022-01-10" }), "compatible");
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2025-06-01" }), "compatible", "immatriculée moins d'un an après la fin de fabrication");
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2026-06-01" }), "hors_periode");
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2019-01-01" }), "hors_periode", "une voiture ne roule pas avant d'être faite");
  assert.equal(situerDansLaPeriode(p, { annee: 2023 }), "compatible", "sans date exacte, l'année suffit");
  assert.equal(situerDansLaPeriode(p, { annee: 2018 }), "hors_periode");
  assert.equal(situerDansLaPeriode(p, {}), "inconnue");
  assert.equal(situerDansLaPeriode(null, { dateMiseEnCirculation: "2022-01-10" }), "inconnue");
});

const fiches = [NISSAN_QASHQAI, BMW_SERIES, CITROEN_C3_AIRCROSS, RENAULT_TRUCKS, ACCESSOIRE];

test("une voiture concernée : la campagne est retenue, et seulement à vérifier", () => {
  const r = campagnesPour({ vehicule: { marque: "Nissan", modele: "Qashqai", dateMiseEnCirculation: "2022-03-01" }, fiches });
  assert.equal(r.etat, "a_verifier");
  assert.equal(r.total, 1);
  assert.equal(r.retenues.length, 1);
  assert.equal(r.retenues[0].lien, "https://rappel.conso.gouv.fr/fiche-rappel/49909/rapex");
  assert.equal(r.retenues[0].situation, "compatible");
});

test("hors période : la fiche est écartée de la liste principale, pas supprimée", () => {
  const r = campagnesPour({ vehicule: { marque: "Nissan", modele: "Qashqai", dateMiseEnCirculation: "2012-03-01" }, fiches });
  assert.equal(r.etat, "a_verifier");
  assert.equal(r.retenues.length, 0);
  assert.equal(r.ecartees.length, 1);
});

test("les accessoires et les camions ne remontent pas dans les campagnes d'une voiture", () => {
  const peugeot = campagnesPour({ vehicule: { marque: "Peugeot", modele: "208", annee: 2020 }, fiches });
  assert.equal(peugeot.etat, "aucune_connue", "la fiche « 208 tapis de sol » n'est pas une campagne sur la voiture");
  const renault = campagnesPour({ vehicule: { marque: "Renault", modele: "Clio", annee: 2020 }, fiches });
  assert.equal(renault.etat, "aucune_connue");
});

test("sans marque ni modèle, on ne cherche rien", () => {
  const r = campagnesPour({ vehicule: { marque: "Nissan" }, fiches });
  assert.equal(r.etat, "donnees_insuffisantes");
  assert.deepEqual(r.manques, ["marque_modele"]);
});

test("une C3 voit la campagne « C3 Aircross », signalée comme un modèle voisin", () => {
  const r = campagnesPour({ vehicule: { marque: "Citroën", modele: "C3", dateMiseEnCirculation: "2025-04-01" }, fiches });
  assert.equal(r.total, 1);
  assert.equal(r.retenues[0].modeleVoisin, true);
  assert.equal(r.retenues[0].modeles, "c3 aircross v3 : 24.02.2025 - 21.05.2025", "la fiche dit elle-même de quel modèle elle parle");
});
