// Ce que Nexora sait d'une voiture, et comment elle le sait.
//
// Le moteur ne calcule pas d'échéance : c'est le travail de lib/auto/echeances.js
// et de components/auto/aPrevoir.js, qui répondent « quoi faire, pour quand ».
// Ici on répond à la question d'avant : « qu'est-ce qui s'applique à CETTE
// voiture, d'après quelle source, et qu'est-ce qui manque pour le dire ? »
//
// Trois règles de conduite, dans cet ordre :
//
// 1. Une règle ne s'applique que si son applicabilité est démontrée. Pas
//    d'inférence depuis le nom commercial d'un modèle : ni huile, ni pression,
//    ni intervalle, ni distribution.
// 2. Chaque résultat porte un état, et « je ne sais pas » en est un. Un vide
//    honnête vaut mieux qu'une phrase plausible.
// 3. Une source non relue depuis plus d'un an cesse d'affirmer quoi que ce
//    soit : elle passe en « à relire », pas en « probablement encore vrai ».
//
// États rendus :
// - "applicable"            : la règle s'applique et le résultat est établi ;
// - "a_verifier"            : quelque chose peut concerner cette voiture, et
//                             seul un tiers (le constructeur) peut trancher ;
// - "donnees_insuffisantes" : il manque un fait, dit avec le geste qui le comble ;
// - "non_applicable"        : la règle ne vise pas ce véhicule ;
// - "indisponible"          : Nexora n'a pas accès à la connaissance nécessaire,
//                             et dit pourquoi — jamais un silence ;
// - "source_a_relire"       : la source a vieilli, on se tait jusqu'à relecture.
//
// Module pur, testé (moteur.test.js). Les campagnes de rappel lui sont
// passées déjà lues : il ne connaît pas le réseau.

import { POURQUOI_CARBURANT_HYBRIDE, SITE_OFFICIEL, classerCritair } from "./critair.js";
import { campagnesPour } from "./campagnes.js";
import { SOURCES, citation, sourcesAVerifier } from "./sources.js";

export const CATEGORIES = {
  obligation: { libelle: "Obligation", rang: 1 },
  securite: { libelle: "Sécurité", rang: 2 },
  environnement: { libelle: "Circulation", rang: 3 },
  entretien: { libelle: "Entretien", rang: 4 },
};

// Les faits dont les règles ont besoin, et le geste qui les obtient. Le code
// d'action est celui que la fiche véhicule lit déjà (?action=…) ; ce module ne
// connaît pas les écrans.
export const FAITS = {
  energie: {
    libelle: "L'énergie de votre voiture",
    pourquoi: "Elle décide de la classe Crit'Air, et des prestations qui la concernent.",
    action: "modifier",
    geste: "Compléter la fiche",
  },
  date_mise_en_circulation: {
    libelle: "La date de première mise en circulation",
    pourquoi: "C'est la case B de votre carte grise. Elle situe le contrôle technique et donne la classe Crit'Air.",
    action: "mise_en_circulation",
    geste: "Renseigner la date",
  },
  marque_modele: { libelle: "La marque et le modèle", pourquoi: "Ils servent à retrouver les campagnes de rappel publiées.", action: "modifier", geste: "Compléter la fiche" },
  carburant_hybride: {
    libelle: "Le carburant de votre hybride",
    pourquoi: POURQUOI_CARBURANT_HYBRIDE,
    action: "modifier",
    geste: "Préciser dans la motorisation",
  },
};

const manque = (cle) => ({ cle, ...FAITS[cle] });

// ---------------------------------------------------------------------------
// Règle 1 — la classe Crit'Air
// ---------------------------------------------------------------------------

function regleCritair(vehicule) {
  const base = {
    cle: "critair",
    titre: "Classe Crit'Air",
    categorie: "environnement",
    source: "arrete-2016-06-21-critair",
  };
  const r = classerCritair({ energie: vehicule.energie, dateMiseEnCirculation: vehicule.date_mise_en_circulation });

  if (r.etat === "donnees_insuffisantes") {
    return {
      ...base,
      etat: "donnees_insuffisantes",
      manques: r.manques.map(manque),
      alternatives: r.alternatives ?? null,
      resume: r.alternatives
        ? "Cette voiture se classe d'après son carburant."
        : "La classe Crit'Air de cette voiture se calcule, il manque une information.",
    };
  }
  if (r.etat === "non_applicable") {
    return { ...base, etat: "non_applicable", resume: "L'arrêté ne prévoit pas de classe pour cette énergie.", raison: r.raison };
  }

  const faits = [{ cle: "energie", valeur: vehicule.energie }];
  if (r.fondement === "date_premiere_immatriculation") faits.push({ cle: "date_mise_en_circulation", valeur: vehicule.date_mise_en_circulation });

  return {
    ...base,
    etat: "applicable",
    resume: r.classe === "non_classe" ? "Cette voiture n'est pas classée par la nomenclature." : `Cette voiture relève de la ${r.libelle}.`,
    valeur: { classe: r.classe, libelle: r.libelle, couleur: r.couleur, norme: r.norme },
    faitsUtilises: faits,
    limites: r.limites,
    lien: { libelle: "Commander la vignette sur le site officiel", url: SITE_OFFICIEL },
  };
}

// ---------------------------------------------------------------------------
// Règle 2 — les campagnes de rappel publiées
// ---------------------------------------------------------------------------

function regleCampagnes(vehicule, campagnes) {
  const base = {
    cle: "campagnes_rappel",
    titre: "Campagnes de rappel",
    categorie: "securite",
    source: "rappelconso-v2",
  };

  if (!campagnes || campagnes.etat === "indisponible") {
    return {
      ...base,
      etat: "indisponible",
      resume: "La base officielle des rappels n'a pas répondu. Rien n'est affirmé sur cette voiture.",
      raison: campagnes?.raison ?? "non_consultee",
      lien: { libelle: "Consulter rappel.conso.gouv.fr", url: "https://rappel.conso.gouv.fr/" },
    };
  }

  // La base rend des lignes en `colonne_de_base` ; les modules de calcul
  // parlent camelCase. La traduction se fait ici, une fois, sinon la période
  // est lue comme « inconnue » sans que rien ne le signale.
  const pourCampagnes = {
    marque: vehicule.marque,
    modele: vehicule.modele,
    annee: vehicule.annee ?? null,
    dateMiseEnCirculation: vehicule.date_mise_en_circulation ?? null,
  };
  const r = campagnesPour({ vehicule: pourCampagnes, fiches: campagnes.fiches ?? [] });

  if (r.etat === "donnees_insuffisantes") {
    return { ...base, etat: "donnees_insuffisantes", manques: r.manques.map(manque), resume: "Sans marque ni modèle, Nexora ne peut pas chercher." };
  }
  if (r.etat === "aucune_connue") {
    return {
      ...base,
      etat: "non_applicable",
      resume: "Aucune campagne publiée ne nomme ce modèle.",
      // Dit sans détour : l'absence dans une base n'est pas une garantie.
      limites: ["Nexora ne lit que les fiches publiées sur RappelConso. Une absence n'est pas une garantie : seul le constructeur peut répondre pour votre voiture."],
      total: 0,
    };
  }

  const nombre = r.retenues.length;
  return {
    ...base,
    etat: "a_verifier",
    resume:
      nombre === 0
        ? `${r.ecartees.length} campagne${r.ecartees.length > 1 ? "s" : ""} nomme${r.ecartees.length > 1 ? "nt" : ""} ce modèle, hors de la période de fabrication de votre voiture.`
        : `${nombre} campagne${nombre > 1 ? "s" : ""} publiée${nombre > 1 ? "s" : ""} nomme${nombre > 1 ? "nt" : ""} ce modèle. Seul le constructeur peut dire si VOTRE voiture est concernée, à partir de son numéro de série.`,
    valeur: { retenues: r.retenues, ecartees: r.ecartees, total: r.total, tronque: campagnes.tronque ?? false, terme: r.terme, elargi: r.elargi },
    faitsUtilises: [{ cle: "marque_modele", valeur: `${vehicule.marque} ${vehicule.modele}` }],
    limites: [
      "Le modèle est un texte libre dans les fiches officielles : une campagne affichée peut viser une autre version du même nom.",
      "La période indiquée est une période de fabrication ou de commercialisation, pas d'immatriculation.",
      campagnes.tronque ? "Seules les campagnes les plus récentes de cette marque ont été lues." : null,
      r.elargi ? `Aucune fiche ne nomme exactement « ${vehicule.modele} » : la recherche a porté sur « ${r.terme} ».` : null,
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Règle 3 — le programme d'entretien du constructeur
// ---------------------------------------------------------------------------
//
// Cette règle existe pour DIRE qu'elle ne peut pas répondre, et pourquoi.
// Un écran muet laisserait croire que la question n'a pas été posée.
//
// État des lieux du 20 septembre 2026, après examen des quatre fournisseurs
// cités dans le dossier de cadrage (voir docs/architecture/nexora-auto-connaissance.md) :
// aucun ne publie de conditions d'affichage grand public, aucun n'est
// accessible sans contrat ou création de compte, et la séquence d'appels de
// TecRMI impose une étape de variante (`bodyQualColId`) qu'aucun identifiant
// français ne permet aujourd'hui d'atteindre.
//
// `PROGRAMMES` est vide et le restera tant qu'une source ne sera pas à la fois
// citable et autorisée. Y ajouter une entrée est une décision documentée, pas
// une amélioration discrète : chaque entrée doit porter sa clé de source.

export const PROGRAMMES = {};

export function programmePour(vehicule, programmes = PROGRAMMES) {
  const cle = vehicule?.variante;
  return cle && programmes[cle] ? programmes[cle] : null;
}

function regleProgramme(vehicule, programmes) {
  const base = {
    cle: "programme_entretien",
    titre: "Programme d'entretien du constructeur",
    categorie: "entretien",
    source: null,
  };

  const programme = programmePour(vehicule, programmes);
  if (programme) {
    return {
      ...base,
      etat: "applicable",
      source: programme.source,
      resume: programme.resume,
      valeur: { intervalleKm: programme.intervalle_km ?? null, intervalleMois: programme.intervalle_mois ?? null, variante: vehicule.variante },
      faitsUtilises: [{ cle: "variante", valeur: vehicule.variante }],
      limites: programme.limites ?? [],
    };
  }

  const intervalleRenseigne = Number.isFinite(vehicule?.intervalle_entretien_km) || Number.isFinite(vehicule?.intervalle_entretien_mois);
  return {
    ...base,
    etat: "indisponible",
    resume: intervalleRenseigne
      ? "Nexora n'a pas le programme du constructeur pour cette version : votre suivi repose sur l'intervalle que vous avez renseigné."
      : "Nexora n'a pas le programme du constructeur pour cette version. L'intervalle se lit sur votre carnet d'entretien.",
    raison: "aucune_source_autorisee",
    limites: [
      "Les périodicités d'entretien dépendent de la motorisation exacte. Les publier sans la bonne version produirait une échéance fausse.",
      "Les bases professionnelles qui les contiennent exigent un contrat, et aucune ne publie de droit d'affichage grand public.",
    ],
  };
}

// ---------------------------------------------------------------------------
// L'assemblage
// ---------------------------------------------------------------------------

const RANG_ETATS = { a_verifier: 0, applicable: 1, donnees_insuffisantes: 2, indisponible: 3, non_applicable: 4, source_a_relire: 5 };

// { connaissances, aVerifier, manques, questions, sourcesARelire }
//
// `campagnes` vient de campagnes-serveur.js ; `null` signifie « pas consultée »,
// ce qui n'est pas la même chose que « aucune campagne ».
export function connaissancesDe({ vehicule, campagnes = null, aujourdhui, programmes = PROGRAMMES, sources = SOURCES } = {}) {
  if (!vehicule) return { connaissances: [], aVerifier: [], manques: [], sourcesARelire: [] };

  const perimees = new Set(aujourdhui ? sourcesAVerifier(aujourdhui, sources) : []);

  const brutes = [regleCampagnes(vehicule, campagnes), regleCritair(vehicule), regleProgramme(vehicule, programmes)];

  const connaissances = brutes.map((c) => {
    // Une source vieillie n'affirme plus rien — mais un « indisponible » ou un
    // « manque » n'affirmait déjà rien, et reste tel quel.
    if (c.source && perimees.has(c.source) && (c.etat === "applicable" || c.etat === "a_verifier")) {
      return {
        ...c,
        etat: "source_a_relire",
        valeur: null,
        resume: "Cette information repose sur une source qui n'a pas été relue depuis plus d'un an. Nexora préfère se taire.",
      };
    }
    return c;
  });

  connaissances.sort((a, b) => RANG_ETATS[a.etat] - RANG_ETATS[b.etat] || CATEGORIES[a.categorie].rang - CATEGORIES[b.categorie].rang);

  const manques = [];
  for (const c of connaissances) for (const m of c.manques ?? []) if (!manques.some((x) => x.cle === m.cle)) manques.push(m);

  return {
    connaissances,
    aVerifier: connaissances.filter((c) => c.etat === "a_verifier"),
    manques,
    sourcesARelire: [...perimees],
  };
}

// La citation à déplier sous une connaissance. Séparée pour que l'écran ne
// fabrique jamais une référence lui-même.
export function referenceDe(connaissance) {
  return connaissance?.source ? citation(connaissance.source) : null;
}
