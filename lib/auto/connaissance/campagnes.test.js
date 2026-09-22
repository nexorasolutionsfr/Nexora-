import assert from "node:assert/strict";
import test from "node:test";

import { analyserLibelleModele, campagnesPour, correspondance, generationNommee, lirePeriode, memeMarque, mentionneModele, paliersDeRecherche, situerDansLaPeriode } from "./campagnes.js";

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

test("Yaris, Yaris Cross et GR Yaris ne sont pas la même voiture", () => {
  // Relevé sur des fiches réelles du 20 septembre 2026.
  assert.equal(correspondance("yaris, yaris cross voiture de tourisme", "yaris"), "exacte", "la virgule clôt le nom : la fiche nomme bien la Yaris");
  assert.equal(correspondance("yaris cross voiture de tourisme", "yaris"), "voisine");
  assert.equal(correspondance("gr yaris voiture de tourisme", "yaris"), "voisine", "le voisin peut être devant");
  assert.equal(correspondance("aygo, aygo x, yaris, gr yaris, hilux", "yaris"), "exacte", "une énumération qui contient les deux nomme bien la Yaris");
  assert.equal(correspondance("c3 aircross v3 : rappel", "c3"), "voisine");
  assert.equal(correspondance("qashqai voiture de tourisme.", "qashqai"), "exacte");
  assert.equal(correspondance("308 voiture de tourisme", "208"), null);
});

test("une génération se distingue d'un autre modèle", () => {
  assert.equal(correspondance("208 v2 voiture de tourisme.", "208"), "generation");
  assert.equal(generationNommee("208 v2 voiture de tourisme.", "208"), "v2");
  assert.equal(correspondance("boxer ng véhicule utilitaire léger.", "boxer"), "generation");
  assert.equal(generationNommee("clio voiture de tourisme", "clio"), null);
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
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2026-06-01" }), "posterieure");
  assert.equal(situerDansLaPeriode(p, { dateMiseEnCirculation: "2019-01-01" }), "anterieure", "une voiture ne roule pas avant d'être faite");
  assert.equal(situerDansLaPeriode(p, { annee: 2023 }), "compatible", "sans date exacte, l'année suffit");
  assert.equal(situerDansLaPeriode(p, { annee: 2018 }), "anterieure");
  assert.equal(situerDansLaPeriode(p, { annee: 2027 }), "posterieure");
  assert.equal(situerDansLaPeriode(p, {}), "inconnue");
  assert.equal(situerDansLaPeriode(null, { dateMiseEnCirculation: "2022-01-10" }), "inconnue");
});

// Le correctif demandé le 22 septembre 2026, et sa raison.
//
// Les douze mois de marge entre fabrication et immatriculation sont une
// HYPOTHÈSE. Les dépasser ne prouve rien : une voiture de stock, de
// démonstration ou importée s'immatricule plus tard sans cesser d'appartenir
// au lot fabriqué. Une hypothèse ne peut pas fonder une exclusion.
//
// Mais lever cette exclusion ne doit pas produire la faute inverse — faire
// remonter ces fiches en alertes. D'où deux axes qui ne se touchent pas :
// la PERTINENCE (cette fiche nomme-t-elle mon modèle ?) et l'APPLICABILITÉ
// (ma voiture peut-elle faire partie du lot ?). Un doute sur la seconde ne
// retire rien à la première, et n'ajoute rien non plus.
test("la marge de douze mois fait douter, elle n'exclut pas — et un doute n'est pas une alerte", () => {
  const lot = fiche({
    id: 70,
    marque_produit: "nissan",
    modeles_ou_references: "qashqai voiture de tourisme.",
    identification_produits: ["04.05.2021 - 17.10.2024"],
  });

  // Immatriculée bien après la fin de fabrication : douteux, non démontré.
  const tardive = campagnesPour({ vehicule: { marque: "Nissan", modele: "Qashqai", dateMiseEnCirculation: "2026-06-01" }, fiches: [lot] });
  assert.equal(tardive.ecartees.length, 0, "la marge est une hypothèse : elle ne peut pas écarter");
  assert.equal(tardive.aConfirmer.length, 1, "la fiche existe, sous réserve de période");
  assert.equal(tardive.principales.length, 0, "…mais elle ne remonte pas au premier plan pour autant");
  assert.equal(tardive.aConfirmer[0].applicabilite, "a_verifier");
  assert.equal(tardive.aConfirmer[0].situation, "posterieure");
  assert.equal(tardive.etat, "a_verifier", "l'accès à la vérification officielle reste ouvert");

  // Immatriculée avant même le début de la fabrication : contradiction.
  const impossible = campagnesPour({ vehicule: { marque: "Nissan", modele: "Qashqai", dateMiseEnCirculation: "2012-03-01" }, fiches: [lot] });
  assert.equal(impossible.ecartees.length, 1, "aucune marge n'est en jeu ici : la voiture roulait avant");
  assert.equal(impossible.ecartees[0].applicabilite, "contredite");
  assert.equal(impossible.aConfirmer.length, 0);
  assert.equal(impossible.principales.length, 0);

  // Les deux axes ne se contaminent pas : la pertinence reste intacte des
  // deux côtés, et le doute de période ne dégrade pas une correspondance.
  for (const r of [tardive, impossible]) {
    const seule = [...r.principales, ...r.aConfirmer, ...r.ecartees][0];
    assert.equal(seule.correspondance, "exacte", "la fiche nomme « qashqai » quoi qu'il arrive aux dates");
  }
});

// La Corsa de Baptiste : diesel de 2007, le cas de la recette réelle.
test("aucune fiche n'est perdue : les quatre groupes partitionnent les candidates", () => {
  const voisine = fiche({ id: 71, marque_produit: "opel", modeles_ou_references: "corsa e voiture de tourisme.", identification_produits: ["01.01.2006 - 01.01.2010"] });
  const sansPeriode = fiche({ id: 72, marque_produit: "opel", modeles_ou_references: "corsa voiture de tourisme.", identification_produits: ["à partir du 01.01.2020"] });
  const marge = fiche({ id: 73, marque_produit: "opel", modeles_ou_references: "corsa voiture de tourisme.", identification_produits: ["04.05.1998 - 17.10.2000"] });
  const impossible = fiche({ id: 74, marque_produit: "opel", modeles_ou_references: "corsa voiture de tourisme.", identification_produits: ["04.05.2014 - 17.10.2019"] });

  const r = campagnesPour({
    vehicule: { marque: "Opel", modele: "Corsa", dateMiseEnCirculation: "2007-05-01" },
    fiches: [voisine, sansPeriode, marge, impossible],
  });

  assert.equal(r.total, 4);
  assert.equal(r.principales.length + r.aConfirmer.length + r.voisines.length + r.ecartees.length, r.total, "aucune fiche perdue, aucune comptée deux fois");
  assert.deepEqual(
    [r.principales.map((f) => f.id), r.aConfirmer.map((f) => f.id), r.voisines.map((f) => f.id), r.ecartees.map((f) => f.id)],
    [["72"], ["73"], ["71"], ["74"]],
    "période illisible au premier plan ; marge dépassée à vérifier ; autre version à part ; fabrication postérieure écartée",
  );
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

test("fabrication postérieure à la mise en circulation : la fiche est écartée, pas supprimée", () => {
  const r = campagnesPour({ vehicule: { marque: "Nissan", modele: "Qashqai", dateMiseEnCirculation: "2012-03-01" }, fiches });
  assert.equal(r.etat, "a_verifier");
  assert.equal(r.retenues.length, 0);
  assert.equal(r.ecartees.length, 1);
  assert.equal(r.ecartees[0].applicabilite, "contredite", "contradiction de dates, pas hypothèse de marge");
});

test("les accessoires et les camions ne remontent pas dans les campagnes d'une voiture", () => {
  const peugeot = campagnesPour({ vehicule: { marque: "Peugeot", modele: "208", annee: 2020 }, fiches });
  assert.equal(peugeot.etat, "aucune_fiche", "la fiche « 208 tapis de sol » n'est pas une campagne sur la voiture");
  const renault = campagnesPour({ vehicule: { marque: "Renault", modele: "Clio", annee: 2020 }, fiches });
  assert.equal(renault.etat, "aucune_fiche");
});

test("sans marque ni modèle, on ne cherche rien", () => {
  const r = campagnesPour({ vehicule: { marque: "Nissan" }, fiches });
  assert.equal(r.etat, "donnees_insuffisantes");
  assert.deepEqual(r.manques, ["marque_modele"]);
});

test("une C3 voit la campagne « C3 Aircross », signalée comme un modèle voisin", () => {
  const r = campagnesPour({ vehicule: { marque: "Citroën", modele: "C3", dateMiseEnCirculation: "2025-04-01" }, fiches });
  assert.equal(r.total, 1);
  assert.equal(r.retenues[0].correspondance, "voisine");
  assert.equal(r.retenues[0].modeles, "c3 aircross v3 : 24.02.2025 - 21.05.2025", "la fiche dit elle-même de quel modèle elle parle");
});

test("le libellé d'une voiture se lit, il ne se découpe pas au hasard", () => {
  // Relevé sur une vraie voiture de Test : « Peugeot 208 (essai) ». Ce qui est
  // entre parenthèses est une annotation de la personne, pas un modèle.
  assert.deepEqual(analyserLibelleModele("208 (essai)"), { nom: "208", annotation: "essai" });
  assert.deepEqual(analyserLibelleModele("Clio IV"), { nom: "clio iv", annotation: null });
  assert.deepEqual(analyserLibelleModele("  "), { nom: null, annotation: null });
  assert.deepEqual(paliersDeRecherche("208 (essai)"), [{ terme: "208", precision: "exacte" }]);
  assert.deepEqual(paliersDeRecherche("Clio IV"), [
    { terme: "clio iv", precision: "exacte" },
    { terme: "clio", precision: "moins_precise" },
  ]);
});

const FICHE_208 = fiche({
  id: 42,
  marque_produit: "peugeot",
  modeles_ou_references: "208 v2 voiture de tourisme.",
  identification_produits: ["01.02.2020 - 09.07.2025"],
});

test("« 208 (essai) » trouve les campagnes de la 208, sans élargir", () => {
  const r = campagnesPour({ vehicule: { marque: "Peugeot", modele: "208 (essai)", annee: 2021 }, fiches: [FICHE_208] });
  assert.equal(r.etat, "a_verifier");
  assert.equal(r.terme, "208");
  assert.equal(r.precision, "exacte", "retirer une annotation n'est pas élargir");
  assert.equal(r.retenues[0].generation, "v2", "la génération nommée par la fiche doit être visible");
});

test("le palier le plus précis gagne ; descendre d'un palier se dit", () => {
  const picasso = fiche({ id: 43, marque_produit: "citroen", modeles_ou_references: "c3 picasso (a58) voiture de tourisme." });
  const c3 = fiche({ id: 44, marque_produit: "citroen", modeles_ou_references: "c3 voiture de tourisme." });

  const precis = campagnesPour({ vehicule: { marque: "Citroën", modele: "C3 Picasso" }, fiches: [picasso, c3] });
  assert.equal(precis.terme, "c3 picasso");
  assert.equal(precis.precision, "exacte");
  assert.equal(precis.total, 1, "on ne remonte pas les C3 quand les C3 Picasso suffisent");

  const large = campagnesPour({ vehicule: { marque: "Citroën", modele: "C3 Picasso" }, fiches: [c3] });
  assert.equal(large.terme, "c3");
  assert.equal(large.precision, "moins_precise", "aucune fiche « c3 picasso » : on descend d'un palier, et on le dit");
  assert.equal(large.total, 1);
});

test("aucune fiche ne nomme ce modèle : ce n'est pas « aucun rappel »", () => {
  const r = campagnesPour({ vehicule: { marque: "Peugeot", modele: "208" }, fiches: [] });
  assert.equal(r.etat, "aucune_fiche");
  assert.equal(r.total, 0);
});

test("une version voisine ne passe jamais devant une fiche qui nomme le modèle", () => {
  // Constat de Baptiste sur sa Corsa, en Production : la fiche « Corsa F,
  // Corsa E » (voisine) s'affichait AVANT deux fiches nommant « Corsa », parce
  // qu'elle était la plus récente.
  const voisineRecente = fiche({ id: 51, date_publication: "2026-01-01T00:00:00+00:00", marque_produit: "opel", modeles_ou_references: "corsa f, corsa e voiture de tourisme." });
  const exacteAncienne = fiche({ id: 50, date_publication: "2020-01-01T00:00:00+00:00", marque_produit: "opel", modeles_ou_references: "corsa voiture de tourisme." });
  const r = campagnesPour({ vehicule: { marque: "Opel", modele: "Corsa" }, fiches: [voisineRecente, exacteAncienne] });
  assert.equal(r.total, 2);
  assert.equal(r.retenues[0].id, "50", "la fiche qui nomme le modèle passe devant, même plus ancienne");
  assert.deepEqual(r.principales.map((c) => c.id), ["50"]);
  assert.deepEqual(r.voisines.map((c) => c.id), ["51"], "la voisine est rangée à part, pas supprimée");
  assert.equal(r.exactes, 1);
});

test("la génération se lit sur toutes les occurrences, pas sur la première", () => {
  // Fiche réelle du 11 décembre 2025 : la première occurrence de « c3 » est
  // suivie d'« aircross », la seconde de « v4 ». C'est la v4 qu'il faut dire.
  const texte = "berlingo, c3 aircross v2, c3 v4, c4 cactus voiture particulière";
  assert.equal(generationNommee(texte, "c3"), "v4");
  assert.equal(correspondance(texte, "c3"), "generation");
});

test("le détail des correspondances s'additionne", () => {
  const f = (id, modeles) => fiche({ id, marque_produit: "citroen", modeles_ou_references: modeles });
  const r = campagnesPour({
    vehicule: { marque: "Citroën", modele: "C3" },
    fiches: [f(1, "c3 voiture de tourisme"), f(2, "c3 v4 voiture de tourisme"), f(3, "c3 aircross voiture de tourisme")],
  });
  assert.equal(r.total, 3);
  assert.equal(r.exactes + r.generations + r.voisines.length, r.retenues.length, "les trois niveaux couvrent toutes les fiches retenues");
  assert.deepEqual([r.exactes, r.generations, r.voisines.length], [1, 1, 1]);
  assert.deepEqual(r.principales.map((c) => c.correspondance), ["exacte", "generation"], "et le classement va du plus précis au moins précis");
});

test("une seule date ne fait pas une période : on ne exclut personne là-dessus", () => {
  // Audit demandé après la recette : la période est une période de
  // FABRICATION, la nôtre une date d'IMMATRICULATION. Une fenêtre d'un seul
  // jour, tirée d'une date isolée, écarterait à tort une voiture concernée.
  assert.equal(lirePeriode(["à partir du 01.01.2020"]), null);
  assert.equal(lirePeriode(["publiée le 15.03.2022"]), null);
  assert.deepEqual(lirePeriode(["01.01.2020 - 31.12.2021"]), { debut: "2020-01-01", fin: "2021-12-31" });

  const isolee = fiche({ id: 60, marque_produit: "opel", modeles_ou_references: "corsa voiture de tourisme.", identification_produits: ["à partir du 01.01.2020"] });
  const r = campagnesPour({ vehicule: { marque: "Opel", modele: "Corsa", dateMiseEnCirculation: "2007-05-01" }, fiches: [isolee] });
  assert.equal(r.principales.length, 1, "la fiche reste au premier plan : rien ne permet de l'écarter");
  assert.equal(r.ecartees.length, 0);
  assert.equal(r.principales[0].situation, "inconnue");
});
