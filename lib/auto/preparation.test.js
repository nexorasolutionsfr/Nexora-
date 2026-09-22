import assert from "node:assert/strict";
import test from "node:test";

import { aRapporter, identiteConnue, pointsAdemander, preparerLaVisite, texteAEmporter } from "./preparation.js";
import { BESOINS } from "./besoins.js";

// La voiture de la recette réelle : diesel de 2007, aucun programme publié,
// aucune facture, aucun intervalle connu. C'est le cas qui a motivé ce module.
const CORSA = {
  id: "c1",
  marque: "Opel",
  modele: "Corsa",
  motorisation: "1.3 CDTI",
  energie: "diesel",
  date_mise_en_circulation: "2007-05-20",
  historique: [],
};

const KM = { etat: "releve", dernier: { date: "2026-09-22", kilometrage: 231000, origine: "releve" }, joursDepuis: 0, ancien: false };
const CT = { etat: "calcule", source: "proces_verbal", fondement: "officiel", date: "2028-06-23", joursRestants: 640, niveau: "loin" };

// Espace ordinaire volontairement : `toLocaleString("fr-FR")` rend une espace
// insécable étroite, et le test comparerait deux caractères invisibles
// différents. Ce module ne formate pas — il reçoit des formateurs.
const formateurs = {
  date: (d) => d.split("-").reverse().join("/"),
  km: (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} km`,
  energie: (e) => e.charAt(0).toUpperCase() + e.slice(1),
};

test("une seule liste d'intentions, et chacune sait ce qu'elle produit", () => {
  // Il n'existe volontairement pas de liste « INTENTIONS » à côté de BESOINS :
  // deux énumérations de ce que veut un conducteur auraient divergé.
  const par = Object.fromEntries(BESOINS.map((b) => [b.code, b]));
  for (const code of ["entretenir", "rendez_vous", "probleme", "informations"]) {
    assert.ok(par[code], `l'intention « ${code} » doit exister dans BESOINS`);
  }

  assert.ok(par.entretenir.preparation, "aboutit à un résumé à emporter");
  assert.ok(par.rendez_vous.preparation);
  assert.ok(par.probleme.guide, "réutilise le parcours guidé du 18 sept., ne le réécrit pas");
  assert.equal(par.informations.fiche, "connaissance", "la carte de connaissance existe déjà : on y mène");

  // Les trois attributs s'excluent : un besoin ne fait qu'une chose au clic.
  for (const b of BESOINS) {
    const sorties = [b.guide, b.preparation, b.fiche].filter(Boolean);
    assert.ok(sorties.length <= 1, `« ${b.code} » annonce ${sorties.length} sorties différentes`);
  }
});

test("le résumé reprend ce qui est connu, et ne fabrique pas de ligne vide", () => {
  const lignes = identiteConnue(CORSA, { kilometrage: KM, controle: CT, formateurs });
  const par = Object.fromEntries(lignes.map((l) => [l.cle, l]));

  assert.equal(par.marque_modele.valeur, "Opel Corsa");
  assert.equal(par.motorisation.valeur, "1.3 CDTI");
  assert.equal(par.energie.valeur, "Diesel");
  assert.equal(par.mise_en_circulation.valeur, "20/05/2007");
  assert.equal(par.kilometrage.valeur, "231 000 km");
  assert.equal(par.controle_technique.valeur, "23/06/2028");

  // Une voiture à peine renseignée ne produit pas six lignes « non renseigné ».
  const nue = identiteConnue({ marque: "Opel", modele: "Corsa", historique: [] }, { formateurs });
  assert.deepEqual(
    nue.map((l) => l.cle),
    ["marque_modele"],
    "aucun champ vide ne devient une ligne",
  );
  assert.deepEqual(identiteConnue(null), []);
});

test("un relevé est une mesure, une estimation n'en est pas une", () => {
  // Le kilométrage estimé ne doit JAMAIS entrer dans un texte qu'on lit à un
  // garagiste : ce serait lui donner un calcul pour un compteur.
  const avecEstimation = {
    etat: "releve",
    dernier: { date: "2026-06-01", kilometrage: 228000, origine: "releve" },
    joursDepuis: 113,
    ancien: true,
    parJour: 30,
    estimation: { kilometrage: 231400, auJour: "2026-09-22" },
  };
  const lignes = identiteConnue(CORSA, { kilometrage: avecEstimation, formateurs });
  const km = lignes.find((l) => l.cle === "kilometrage");

  assert.equal(km.valeur, "228 000 km", "c'est le relevé qui est porté, pas l'estimation");
  assert.equal(km.libelle, "Dernier compteur relevé");
  assert.ok(km.precision.includes("01/06/2026"), km.precision);
  assert.ok(!JSON.stringify(lignes).includes("231400"), "l'estimation n'apparaît nulle part dans le résumé emporté");

  // Kilométrage inconnu : pas de ligne du tout.
  assert.ok(!identiteConnue(CORSA, { kilometrage: { etat: "inconnu" }, formateurs }).some((l) => l.cle === "kilometrage"));
});

test("un compteur douteux part avec son doute, jamais sans", () => {
  // Emporter un chiffre chez un garagiste alors que l'application sait que
  // deux relevés se contredisent, ce serait transmettre une valeur à laquelle
  // elle ne croit pas elle-même.
  const contradictoire = {
    etat: "releve",
    dernier: { date: "2026-09-13", kilometrage: 95000, origine: "releve" },
    joursDepuis: 9,
    ancien: false,
    aVerifier: true,
    incoherences: [{ motif: "recul" }],
  };
  const km = identiteConnue(CORSA, { kilometrage: contradictoire, formateurs }).find((l) => l.cle === "kilometrage");
  assert.equal(km.valeur, "95 000 km", "le relevé reste celui qui est enregistré");
  assert.ok(km.precision.includes("se contredisent"), km.precision);
  assert.ok(km.precision.includes("13/09/2026"), "la date du relevé reste lisible");

  // Sans contradiction, pas de réserve ajoutée.
  const sain = identiteConnue(CORSA, { kilometrage: KM, formateurs }).find((l) => l.cle === "kilometrage");
  assert.ok(!sain.precision.includes("contredisent"));
});

test("ce que Nexora ignore devient ce qu'il faut demander", () => {
  // Le renversement qui fait tout l'intérêt du module : les trois manques du
  // suivi ne sont plus trois reproches, ce sont trois questions au garage.
  const points = pointsAdemander({ vehicule: CORSA, intention: "entretenir", programmeConnu: false });
  const cles = points.map((p) => p.cle);

  assert.ok(cles.includes("intervalle"), "l'intervalle manquant devient une question");
  assert.ok(cles.includes("derniere_intervention"));
  assert.ok(cles.includes("programme_introuvable"), "aucune source ne couvre cette voiture : on le demande");

  // Chaque point est une QUESTION, jamais un constat mécanique.
  for (const p of points) {
    assert.ok(p.texte.includes("?"), `« ${p.texte} » doit être une question`);
    assert.ok(p.pourquoi.length > 20, `« ${p.cle} » doit dire pourquoi on la pose`);
    assert.ok(!/usé|usée|à changer|à remplacer|défectueu/i.test(p.texte), `« ${p.texte} » ressemble à un diagnostic`);
  }

  assert.ok(points.length <= 5, "une liste lue à un comptoir tient dans une main");
  assert.deepEqual(pointsAdemander({ vehicule: null }), []);
});

test("on ne demande pas au garage ce qui est déjà affiché", () => {
  const sans = pointsAdemander({ vehicule: CORSA, intention: "entretenir", programmeConnu: false });
  const avec = pointsAdemander({ vehicule: CORSA, intention: "entretenir", programmeConnu: true });

  for (const cle of ["programme_introuvable", "plan_motorisation"]) {
    assert.ok(sans.some((p) => p.cle === cle), `« ${cle} » doit se poser quand rien n'est publié`);
    assert.ok(!avec.some((p) => p.cle === cle), `« ${cle} » : le programme est affiché, la question ferait perdre du temps`);
  }

  // Et l'écran doit MENER à ce programme, sinon il l'annonce sans l'offrir.
  assert.equal(preparerLaVisite({ vehicule: CORSA, programmeConnu: true }).voirProgramme, true);
  assert.equal(preparerLaVisite({ vehicule: CORSA, programmeConnu: false }).voirProgramme, false);
});

test("un suivi complet ne produit plus de question sur le suivi", () => {
  const suivie = {
    ...CORSA,
    intervalle_entretien_km: 15000,
    intervalle_entretien_mois: 12,
    historique: [{ type: "revision", realise_le: "2026-03-01", kilometrage: 225000 }],
  };
  const points = pointsAdemander({ vehicule: suivie, intention: "entretenir", programmeConnu: true });
  assert.deepEqual(points.map((p) => p.cle), ["echeances_age"], "reste la question ouverte, pas les manques ni ce qui est déjà affiché");
});

test("le rendez-vous pose ses propres questions, pas celles de l'entretien", () => {
  const points = pointsAdemander({ vehicule: CORSA, intention: "rendez_vous", programmeConnu: false });
  const cles = points.map((p) => p.cle);
  assert.ok(cles.includes("duree"));
  assert.ok(cles.includes("devis"));
  assert.ok(!cles.includes("programme_introuvable"), "cette question appartient à l'intention entretien");
});

test("ce qu'on rapporte du rendez-vous mène au geste qui l'enregistre", () => {
  const points = pointsAdemander({ vehicule: CORSA, intention: "entretenir" });
  const gestes = aRapporter(points);
  assert.ok(gestes.includes("intervalle"), "la réponse du garage se range dans l'application");
  assert.ok(gestes.includes("revision"));
  assert.equal(new Set(gestes).size, gestes.length, "pas de geste proposé deux fois");
  assert.deepEqual(aRapporter([]), []);
});

test("le texte emporté se lit à voix haute, et n'affirme rien", () => {
  const p = preparerLaVisite({ vehicule: CORSA, intention: "entretenir", programmeConnu: false, kilometrage: KM, controle: CT, formateurs });

  assert.equal(p.etat, "prete");
  assert.ok(p.texte.includes("Opel Corsa"));
  assert.ok(p.texte.includes("1.3 CDTI"));
  assert.ok(p.texte.includes("231 000 km"));
  assert.ok(p.texte.includes("Ce que je voudrais savoir :"));
  assert.ok(p.texte.split("\n").every((l) => l.length < 140), "des lignes courtes, lisibles au comptoir");

  // Le texte ne contient aucune préconisation : Nexora n'a jamais vu la voiture.
  assert.ok(!/tous les \d+/i.test(p.texte), "aucun intervalle générique ne s'y glisse");
  assert.ok(!/€|euro/i.test(p.texte), "aucun prix");

  assert.equal(preparerLaVisite({ vehicule: null }).etat, "sans_voiture");
});

test("la demande de la personne rejoint le texte sans le remplacer", () => {
  const texte = texteAEmporter({
    identite: [{ cle: "marque_modele", libelle: "Voiture", valeur: "Opel Corsa" }],
    demande: "Un bruit inhabituel au freinage, depuis quelques jours.",
    points: [{ cle: "duree", texte: "Combien de temps la voiture doit-elle rester ?" }],
  });
  assert.ok(texte.includes("Ce que je viens faire :"));
  assert.ok(texte.indexOf("Opel Corsa") < texte.indexOf("Un bruit"), "la voiture d'abord, la demande ensuite");
  assert.ok(texte.indexOf("Un bruit") < texte.indexOf("Combien de temps"), "la demande avant les questions");

  // Sans rien, pas de coquille vide.
  assert.equal(texteAEmporter({}), "");
});

test("l'explication s'adapte, et ne promet jamais ce qui n'est pas là", () => {
  const nue = preparerLaVisite({ vehicule: CORSA, intention: "entretenir", programmeConnu: false, formateurs });
  assert.ok(nue.explication.includes("sources examinées"), nue.explication);
  assert.ok(!/aucune source ne publie|n'existe pas/i.test(nue.explication), "une absence constatée n'est pas une absence démontrée");

  const couverte = preparerLaVisite({
    vehicule: { ...CORSA, intervalle_entretien_km: 15000, historique: [{ type: "revision", realise_le: "2026-03-01", kilometrage: 225000 }] },
    intention: "entretenir",
    programmeConnu: true,
    formateurs,
  });
  assert.ok(couverte.explication.includes("programme du constructeur"), couverte.explication);
  assert.equal(couverte.points.filter((p) => p.rapporter).length, 0, "rien à rapporter : tout est déjà connu");
});
