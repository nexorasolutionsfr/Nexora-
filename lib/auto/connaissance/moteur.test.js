import assert from "node:assert/strict";
import test from "node:test";

import { VERIFICATIONS_OFFICIELLES, applicabiliteOperation, connaissancesDe, nombreFichesAVerifier, programmePour, repereMarquePour, referenceDe, verificationOfficielle } from "./moteur.js";
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
  assert.equal(c.valeur.principales.length, 1);
  // La phrase reste conditionnelle : « peut dire SI votre voiture est
  // concernée », jamais « votre voiture est concernée ».
  assert.ok(c.resume.includes("Nexora ne peut pas savoir si votre voiture est concernée"), c.resume);
  assert.ok(!/VOTRE/.test(c.resume), "pas de majuscules insistantes");
  assert.ok(!/^votre voiture/i.test(c.resume), c.resume);
  assert.ok(c.verification.texte.includes("case E"), "le geste qui tranche doit être nommé");
  assert.ok(!/VOTRE/.test(c.verification.titre));
  assert.notEqual(c.etat, "applicable", "une campagne ne devient jamais un fait établi sur CETTE voiture");
  // La date de la base (colonne_en_base) doit atteindre le calcul de période.
  assert.equal(c.valeur.principales[0].situation, "compatible", "la date de mise en circulation doit être lue");
  assert.equal(r.aVerifier.length, 1);
  // Ce qui doit vraiment se voir en premier : la sécurité avant le reste.
  assert.equal(r.connaissances[0].cle, "campagnes_rappel");
});

// Correctif du 22 septembre 2026. Deux fautes à éviter d'un seul geste :
// exclure une voiture sur une hypothèse de douze mois, et transformer le
// doute qui en résulte en alerte d'accueil. La fiche reste donc consultable,
// la vérification officielle reste offerte, et le compteur ne bouge pas.
test("une période dépassée n'exclut pas la voiture — et ne remonte pas sur l'accueil", () => {
  // Fabriquée jusqu'au 09.07.2025, immatriculée plus d'un an après : une
  // voiture de stock ou importée, cas courant, que rien ne permet d'écarter.
  const r = connaissancesDe({ vehicule: voiture({ date_mise_en_circulation: "2026-10-01" }), campagnes: lues(), aujourdhui: "2026-09-22" });
  const c = trouver(r, "campagnes_rappel");

  assert.equal(c.etat, "a_verifier");
  assert.equal(c.valeur.ecartees.length, 0, "une hypothèse n'exclut pas");
  assert.equal(c.valeur.aConfirmer.length, 1, "la fiche reste accessible, sous réserve de période");
  assert.equal(c.valeur.principales.length, 0, "…et ne passe pas pour autant au premier plan");
  assert.equal(c.valeur.aConfirmer[0].applicabilite, "a_verifier");

  // Le point de séparation des deux axes : pertinence intacte, applicabilité
  // en suspens. L'accueil, lui, ne signale que ce qui est au premier plan.
  assert.equal(c.valeur.aConfirmer[0].correspondance, "generation", "la fiche nomme bien ce modèle");
  assert.equal(nombreFichesAVerifier(r.connaissances), 0, "un doute de période ne devient pas une alerte");

  assert.ok(c.resume.includes("période de fabrication à vérifier"), c.resume);
  assert.ok(!/exclut|hors (de la )?période/i.test(c.resume), "on n'affirme pas une exclusion qu'on ne démontre pas");
  assert.ok(c.verification?.lien?.url, "la vérification par numéro de série reste offerte");
});

test("base des rappels injoignable : « rien n'est affirmé », et non « aucune campagne »", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: { etat: "indisponible", raison: "injoignable" }, aujourdhui: "2026-09-20" });
  const c = trouver(r, "campagnes_rappel");
  assert.equal(c.etat, "indisponible");
  assert.ok(c.resume.includes("Rien n'est affirmé"));
  assert.ok(c.liens[0].url.startsWith("https://rappel.conso.gouv.fr"));
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
  assert.ok(c.limites.some((l) => l.includes("ne prouve pas une absence")), c.limites.join(" | "));
  assert.ok(c.verification, "même sans fiche, le geste qui tranche reste proposé");
});

test("une Peugeot : pas de programme publié, et la barrière est nommée", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.equal(p.etat, "indisponible");
  assert.equal(p.raison, "barriere_constructeur");
  assert.ok(p.resume.includes("carnet d'entretien"));
  assert.ok(p.limites.some((l) => l.includes("plan d'entretien")), p.limites.join(" | "));
  assert.equal(p.valeur, undefined, "aucun intervalle n'est proposé");
  // Et elle ne domine pas l'écran : elle passe après ce qui est établi.
  assert.equal(r.connaissances.at(-1).cle, "programme_entretien");
});

test("une Tesla Model 3 : un vrai programme, avec sa source", () => {
  const r = connaissancesDe({ vehicule: voiture({ marque: "Tesla", modele: "Model 3", energie: "electrique" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.equal(p.etat, "applicable");
  assert.equal(p.source, "tesla-entretien-model3");
  assert.equal(p.valeur.niveau, "programme");
  assert.ok(p.valeur.operations.length >= 5);
  const liquide = p.valeur.operations.find((o) => o.libelle.includes("Liquide de frein"));
  assert.deepEqual(liquide.intervalle, { mois: 48 });
  assert.ok(liquide.condition.texte.includes("montagne"));
  assert.equal(liquide.condition.nature, "frequence");
  // Le nom saisi peut porter une annotation : elle ne doit pas faire rater le programme.
  const annote = connaissancesDe({ vehicule: voiture({ marque: "Tesla", modele: "Model 3 (la bleue)" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  assert.equal(trouver(annote, "programme_entretien").etat, "applicable");
});

test("une Model Y n'est pas une Model 3 : filtre HEPA oui, déshydratant non", () => {
  const y = connaissancesDe({ vehicule: voiture({ marque: "Tesla", modele: "Model Y" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(y, "programme_entretien");
  const ops = p.valeur.operations.map((o) => o.libelle).join(" | ");
  assert.ok(ops.includes("HEPA"));
  assert.ok(!ops.includes("déshydratant"));
  const hepa = p.valeur.operations.find((o) => o.libelle.includes("HEPA"));
  assert.equal(applicabiliteOperation(hepa), "a_verifier", "« selon équipement » est une condition d'applicabilité");
});

test("l'appariement se fait sur la marque et le nom lu, pas sur une variante", () => {
  assert.equal(programmePour({ marque: "Tesla", modele: "Model 3" })?.cle, "tesla_model_3");
  assert.equal(programmePour({ marque: "tesla", modele: "model y" })?.cle, "tesla_model_y");
  assert.equal(programmePour({ marque: "Tesla", modele: "Model S" }), null, "aucun programme publié pour ce modèle");
  assert.equal(programmePour({ marque: "Peugeot", modele: "208" }), null);
  assert.equal(repereMarquePour({ marque: "Volkswagen" })?.cle, "volkswagen");
  assert.equal(repereMarquePour({ marque: "Tesla" }), null);
});

test("un repère de marque n'est pas un programme et ne produit aucune échéance", () => {
  const r = connaissancesDe({ vehicule: voiture({ marque: "Volkswagen", modele: "Golf" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.equal(p.etat, "a_preciser");
  assert.equal(p.valeur.niveau, "repere_marque");
  assert.equal(p.source, "volkswagen-plan-entretien");
  assert.ok(p.limites.some((l) => l.includes("pas la préconisation de VOTRE voiture")), p.limites.join(" | "));
  assert.ok(p.limites.some((l) => l.includes("n'en déduit aucune échéance")));
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

test("une recherche élargie se dit dans les limites", () => {
  const fiche208 = { ...FICHE_208, modeles_ou_references: "208 voiture de tourisme." };
  const r = connaissancesDe({ vehicule: voiture({ modele: "208 GTi" }), campagnes: lues([fiche208]), aujourdhui: "2026-09-20" });
  const c = trouver(r, "campagnes_rappel");
  assert.equal(c.etat, "a_verifier");
  assert.equal(c.valeur.precision, "moins_precise");
  assert.ok(c.limites.some((l) => l.includes("208 GTi") && l.includes("« 208 »") && l.includes("moins précise")), c.limites.join(" | "));
});

// ---------------------------------------------------------------------------
// Stabilisation du 20 septembre 2026 : ne rien présenter pour plus sûr que ça
// ne l'est
// ---------------------------------------------------------------------------

test("une classe obtenue par la date est une estimation, et le dit", () => {
  const r = connaissancesDe({ vehicule: voiture({ energie: "diesel" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const c = trouver(r, "critair");
  assert.equal(c.valeur.estimation, true);
  assert.ok(c.resume.startsWith("D'après sa date de première immatriculation"), c.resume);
  assert.ok(c.resume.includes("relèverait"), "le conditionnel n'est pas une coquetterie");
  // La réserve existe, mais dépliée : l'écran principal n'est pas une notice.
  assert.ok(c.limites.some((l) => l.includes("rubrique V.9")), c.limites.join(" | "));
});

test("une classe obtenue par l'énergie n'est pas une estimation", () => {
  const r = connaissancesDe({ vehicule: voiture({ energie: "electrique" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const c = trouver(r, "critair");
  assert.equal(c.valeur.estimation, false);
  assert.equal(c.resume, "Cette voiture relève de la Crit'Air E.");
  assert.ok(!c.limites.some((l) => l.includes("rubrique V.9")), "rien à préciser : la date ne joue aucun rôle ici");
});

test("un intervalle n'est pas une date, et chaque opération a SON point de départ", () => {
  const r = connaissancesDe({ vehicule: voiture({ marque: "Tesla", modele: "Model 3" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.ok(p.avertissement.includes("à quelle fréquence"), p.avertissement);
  assert.ok(p.avertissement.includes("son propre point de départ"), "aucune phrase universelle sur la dernière intervention");
  assert.ok(!/toute échéance|tant que vous n'avez pas enregistré/i.test(p.avertissement), p.avertissement);
  // Chaque opération porte son départ et ce qu'il faudrait pour la dater.
  for (const o of p.valeur.operations) {
    assert.ok(o.depuis, o.libelle);
    assert.ok(Array.isArray(o.besoin) && o.besoin.length > 0, o.libelle);
  }
  const pneus = p.valeur.operations.find((o) => o.libelle.includes("Permutation"));
  assert.equal(pneus.depuis, "derniere_operation_ou_controle", "une permutation se déclenche aussi sur un constat");
  assert.deepEqual(pneus.besoin, ["kilometrage"], "on ne demande pas une date pour une échéance au compteur");
  // Les réserves de la source sont reprises, pas gommées.
  assert.ok(p.limites.some((l) => l.includes("s'ils s'appliquent à votre véhicule")));
  assert.ok(p.limites.some((l) => l.includes("pas exhaustive")));
  assert.ok(p.limites.some((l) => l.includes("PREMIÈRE occurrence")));
});

test("publié pour ce modèle n'est pas applicable à cette voiture", () => {
  const r = connaissancesDe({ vehicule: voiture({ marque: "Tesla", modele: "Model 3" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.equal(p.valeur.aVerifier, 2, "étriers (routes salées) et déshydratant (fabriqué avant 2021)");
  assert.ok(p.resume.includes("Nexora ne peut pas vérifier pour votre voiture"), p.resume);
  const aVerifier = p.valeur.operations.filter((o) => applicabiliteOperation(o) === "a_verifier").map((o) => o.libelle);
  assert.ok(aVerifier.some((l) => l.includes("Étriers")));
  assert.ok(aVerifier.some((l) => l.includes("déshydratant")));
  // Une condition de fréquence n'est PAS une condition d'applicabilité.
  const liquide = p.valeur.operations.find((o) => o.libelle.includes("Liquide de frein"));
  assert.equal(applicabiliteOperation(liquide), "publiee", "un intervalle plus court ne rend pas l'opération incertaine");
});

test("une absence est celle des sources examinées, pas une preuve", () => {
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const p = trouver(r, "programme_entretien");
  assert.ok(p.resume.includes("sources qu'elle a examinées"), p.resume);
  assert.ok(p.limites.some((l) => l.includes("pas une preuve qu'aucun programme n'existe")));
});

test("la vérification mène à une destination officielle réellement vérifiée", () => {
  // La voiture du fondateur. La carte doit proposer un bouton vers Opel, pas
  // seulement l'accueil de RappelConso (constat du 20 septembre 2026).
  const opel = connaissancesDe({ vehicule: voiture({ marque: "Opel", modele: "Corsa" }), campagnes: lues([]), aujourdhui: "2026-09-20" });
  const v = trouver(opel, "campagnes_rappel").verification;
  assert.equal(v.lien.url, "https://www.opel.fr/apres-vente/campagne-de-rappel.html");
  assert.ok(v.lien.libelle.includes("Opel France"));
  assert.ok(v.lien.principal, "c'est l'action de la carte, pas un lien de bas de page");
  assert.ok(v.note.includes("code image"), "le captcha se dit d'avance");
  assert.ok(v.note.includes("Nexora n'envoie pas votre numéro"));

  // Une marque du groupe Renault mène au formulaire du groupe, et le dit.
  const dacia = trouver(connaissancesDe({ vehicule: voiture({ marque: "Dacia", modele: "Sandero" }), campagnes: lues([]), aujourdhui: "2026-09-20" }), "campagnes_rappel").verification;
  assert.equal(dacia.lien.url, "https://www.renault.fr/rappel-renault.html");
  assert.ok(dacia.note.includes("Dacia"));

  // Une marque sans vérificateur connu ne fabrique pas d'adresse.
  const inconnue = trouver(connaissancesDe({ vehicule: voiture({ marque: "Lancia", modele: "Ypsilon" }), campagnes: lues([]), aujourdhui: "2026-09-20" }), "campagnes_rappel").verification;
  assert.equal(inconnue.lien.url, "https://rappel.conso.gouv.fr/");
  assert.ok(!inconnue.lien.principal);
  assert.ok(inconnue.texte.includes("le réseau Lancia"));
});

test("aucune adresse de vérification n'est devinée", () => {
  // Chacune a été ouverte et lue. Le test fige la liste : en ajouter une
  // suppose de l'avoir vérifiée, pas de l'avoir déduite d'un motif d'URL.
  assert.deepEqual(Object.keys(VERIFICATIONS_OFFICIELLES).sort(), ["citroen", "dacia", "opel", "peugeot", "renault", "toyota"]);
  for (const [, v] of Object.entries(VERIFICATIONS_OFFICIELLES)) {
    assert.ok(v.url.startsWith("https://"), v.url);
    assert.ok(v.editeur, v.url);
  }
  assert.equal(verificationOfficielle("Citroën")?.editeur, "Citroën France", "les accents ne doivent pas faire rater la marque");
  assert.equal(verificationOfficielle("Tesla"), null);
});

test("la ligne de l'accueil compte les fiches, sans lire un champ à la main", () => {
  // Cette fonction existe parce que l'accueil lisait `valeur.retenues` en
  // direct : le renommage du champ a fait planter l'écran d'accueil, attrapé
  // au navigateur le 20 septembre 2026. Un accès unique, et un test dessus.
  const voisine = { ...FICHE_208, id: 2, modeles_ou_references: "208 gti voiture de tourisme." };
  const r = connaissancesDe({ vehicule: voiture(), campagnes: lues([FICHE_208, voisine]), aujourdhui: "2026-09-20" });
  assert.equal(nombreFichesAVerifier(r.connaissances), 1, "les versions voisines ne comptent pas sur l'accueil");

  assert.equal(nombreFichesAVerifier([]), 0);
  assert.equal(nombreFichesAVerifier(), 0);
  const sans = connaissancesDe({ vehicule: voiture({ modele: "Qashqai", marque: "Nissan" }), campagnes: lues(), aujourdhui: "2026-09-20" });
  assert.equal(nombreFichesAVerifier(sans.connaissances), 0);
  const panne = connaissancesDe({ vehicule: voiture(), campagnes: { etat: "indisponible", raison: "injoignable" }, aujourdhui: "2026-09-20" });
  assert.equal(nombreFichesAVerifier(panne.connaissances), 0, "une base injoignable ne remplit pas l'accueil");
});
