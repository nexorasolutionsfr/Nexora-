// La classe Crit'Air d'une voiture, d'après le texte qui l'établit.
//
// Pourquoi Nexora peut la dire alors qu'elle ne devine jamais un intervalle
// d'entretien : ici la règle EST publique, complète et sans variante. L'arrêté
// du 21 juin 2016 classe une voiture avec deux informations, et Nexora
// possède les deux dès l'ajout du véhicule — l'énergie et la date de première
// mise en circulation (case B de la carte grise).
//
// Article 1 de l'arrêté, cité : la classification s'opère « lorsque
// l'information est disponible, en fonction de la norme "Euro" figurant dans
// la rubrique V.9 du certificat d'immatriculation ; ou, à défaut, en fonction
// de la date de première immatriculation figurant dans la rubrique B ».
//
// L'ordre compte, et il est respecté ici : la norme Euro d'abord, la date
// ensuite. La date seule peut annoncer une classe TROP FAVORABLE — un diesel
// réceptionné Euro 4 mais immatriculé en janvier 2011 serait dit Crit'Air 2
// alors qu'il est Crit'Air 3 — et une classe trop favorable expose quelqu'un
// à une amende. La norme Euro est donc demandée comme une précision
// facultative, là où elle change la réponse, jamais comme un champ obligatoire.
//
// CE QUE CE MODULE NE DIT PAS :
// - il ne délivre pas la vignette (elle s'obtient sur le site officiel) ;
// - il ne dit pas où l'on peut circuler : les règles des ZFE sont fixées
//   collectivité par collectivité, et l'arrêté n'en parle pas ;
// - il ignore l'article 3 (un dispositif de dépollution installé après coup
//   peut faire classer plus haut), et le signale comme une limite.
//
// Module pur, testé (critair.test.js).

export const SOURCE = "arrete-2016-06-21-critair";
// Le seul site officiel de délivrance de la vignette.
export const SITE_OFFICIEL = "https://www.certificat-air.gouv.fr/";
// Le simulateur officiel « Connaître le classement d'un véhicule (vignette
// Crit'Air) ». C'est LUI qui fait foi : Nexora ne fait que lire la
// nomenclature, elle ne certifie rien.
export const SIMULATEUR_OFFICIEL = "https://www.service-public.gouv.fr/particuliers/vosdroits/R44803";

// Annexe I, colonne « VOITURES », transcrite telle quelle. Les bornes sont
// celles du texte ; `debut`/`fin` sont inclusives et expriment la date de
// première immatriculation. Les cellules vides du tableau (classes 4 et 5 en
// essence) n'existent pas ici : c'est le texte qui est ainsi.
export const NOMENCLATURE_VOITURES = {
  essence: [
    { classe: "1", norme: "EURO 5 et 6", normes: [5, 6], debut: "2011-01-01", fin: null },
    { classe: "2", norme: "EURO 4", normes: [4], debut: "2006-01-01", fin: "2010-12-31" },
    { classe: "3", norme: "EURO 2 et 3", normes: [2, 3], debut: "1997-01-01", fin: "2005-12-31" },
    { classe: "non_classe", norme: "EURO 1 et avant", normes: [1], debut: null, fin: "1996-12-31" },
  ],
  diesel: [
    { classe: "2", norme: "EURO 5 et 6", normes: [5, 6], debut: "2011-01-01", fin: null },
    { classe: "3", norme: "EURO 4", normes: [4], debut: "2006-01-01", fin: "2010-12-31" },
    { classe: "4", norme: "EURO 3", normes: [3], debut: "2001-01-01", fin: "2005-12-31" },
    { classe: "5", norme: "EURO 2", normes: [2], debut: "1997-01-01", fin: "2000-12-31" },
    { classe: "non_classe", norme: "EURO 1 et avant", normes: [1], debut: null, fin: "1996-12-31" },
  ],
};

// « EURO 6 », « 6d-TEMP », « 715/2007*2018/1832AP » : la rubrique V.9 d'une
// carte grise s'écrit de vingt façons. Seul le chiffre de génération compte
// pour la colonne « Voitures » de l'annexe I — les déclinaisons (6b, 6d) ne
// changent pas la classe. On ne lit donc qu'un entier de 1 à 6, et on refuse
// tout le reste plutôt que de deviner.
export function lireNormeEuro(valeur) {
  if (Number.isInteger(valeur)) return valeur >= 1 && valeur <= 6 ? valeur : null;
  if (typeof valeur !== "string") return null;
  // Le chiffre ne doit pas être suivi d'un autre chiffre — « 60 » n'est pas
  // une norme 6, et « 715/2007… » n'en est pas une du tout — mais il peut être
  // suivi d'une lettre : « 6b », « 6d-TEMP ».
  const m = valeur.trim().match(/^(?:euro\s*)?([1-6])(?!\d)/i);
  return m ? Number(m[1]) : null;
}

export const CLASSES = {
  E: { libelle: "Crit'Air E", couleur: "verte", rang: 0 },
  1: { libelle: "Crit'Air 1", couleur: "violette", rang: 1 },
  2: { libelle: "Crit'Air 2", couleur: "jaune", rang: 2 },
  3: { libelle: "Crit'Air 3", couleur: "orange", rang: 3 },
  4: { libelle: "Crit'Air 4", couleur: "bordeaux", rang: 4 },
  5: { libelle: "Crit'Air 5", couleur: "grise", rang: 5 },
  non_classe: { libelle: "Non classé", couleur: null, rang: 6 },
};

// Article 2 : à quelle colonne du tableau mène l'énergie déclarée dans Nexora.
//
// « hybride » (non rechargeable) est volontairement absent : l'arrêté range
// EH (essence-électricité) parmi les véhicules essence et GH
// (gazole-électricité) parmi les diesel. Les deux existent, la classe n'est
// pas la même, et Nexora ne choisit pas à la place de la personne.
export const COLONNE_PAR_ENERGIE = {
  electrique: { classeDirecte: "E", motif: "véhicules électriques et hydrogènes" },
  hybride_rechargeable: { classeDirecte: "1", motif: "véhicules hybrides rechargeables" },
  gpl: { classeDirecte: "1", motif: "véhicules gaz" },
  essence: { colonne: "essence" },
  ethanol: { colonne: "essence", motif: "l'arrêté range le superéthanol E85 parmi les véhicules essence" },
  diesel: { colonne: "diesel" },
};

function dansLaPeriode(iso, { debut, fin }) {
  if (debut && iso < debut) return false;
  if (fin && iso > fin) return false;
  return true;
}

const estIso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

// { etat: "classe", classe, libelle, couleur, norme, fondement, limites, precision? }
// { etat: "donnees_insuffisantes", manques: [...], alternatives? }
// { etat: "non_applicable", raison }
//
// `fondement` dit lequel des deux critères de l'article 1 a servi :
// "norme_euro" (le critère principal), "date_premiere_immatriculation" (le
// repli prévu par le texte) ou "energie" (les colonnes E et 1, qui ne
// dépendent ni de l'un ni de l'autre).
export function classerCritair({ energie, dateMiseEnCirculation, normeEuro } = {}) {
  const norme = lireNormeEuro(normeEuro);

  const manques = [];
  if (!energie) manques.push("energie");
  // La date ne manque que si la norme Euro ne suffit pas à s'en passer.
  if (!estIso(dateMiseEnCirculation) && !norme) manques.push("date_mise_en_circulation");
  if (manques.length > 0) return { etat: "donnees_insuffisantes", manques };

  // Une hybride non rechargeable se classe d'après son carburant : l'arrêté
  // range EH (essence-électricité) avec les essence et GH (gazole-électricité)
  // avec les diesel. Plutôt que d'ajouter une question au formulaire, on rend
  // les DEUX réponses : la personne reconnaît la sienne d'un coup d'œil, et
  // Nexora n'a toujours rien affirmé.
  if (energie === "hybride") {
    const alternatives = ["essence", "diesel"].map((carburant) => {
      const r = classerCritair({ energie: carburant, dateMiseEnCirculation, normeEuro });
      return { carburant, classe: r.classe ?? null, libelle: r.libelle ?? null };
    });
    return { etat: "donnees_insuffisantes", manques: ["carburant_hybride"], alternatives };
  }

  const voie = COLONNE_PAR_ENERGIE[energie];
  if (!voie) return { etat: "non_applicable", raison: "energie_hors_nomenclature" };

  // Les colonnes E et 1 ne regardent ni la norme ni la date : l'article 2
  // range ces énergies d'office.
  if (voie.classeDirecte) {
    return {
      etat: "classe",
      classe: voie.classeDirecte,
      ...CLASSES[voie.classeDirecte],
      norme: null,
      fondement: "energie",
      motif: voie.motif,
      limites: limitesPour("energie"),
    };
  }

  const lignes = NOMENCLATURE_VOITURES[voie.colonne];

  // Article 1, dans l'ordre : la norme Euro d'abord, « à défaut » la date.
  // L'inverse donnerait parfois une classe trop favorable — un diesel Euro 4
  // immatriculé en 2011 serait annoncé Crit'Air 2 au lieu de 3.
  if (norme) {
    const ligne = lignes.find((l) => l.normes.includes(norme));
    if (!ligne) return { etat: "non_applicable", raison: "norme_hors_tableau" };
    return {
      etat: "classe",
      classe: ligne.classe,
      ...CLASSES[ligne.classe],
      norme: ligne.norme,
      normeUtilisee: norme,
      fondement: "norme_euro",
      motif: voie.motif ?? null,
      limites: limitesPour("norme_euro"),
    };
  }

  const jour = dateMiseEnCirculation.slice(0, 10);
  const ligne = lignes.find((l) => dansLaPeriode(jour, l));
  if (!ligne) return { etat: "non_applicable", raison: "date_hors_tableau" };

  return {
    etat: "classe",
    classe: ligne.classe,
    ...CLASSES[ligne.classe],
    norme: ligne.norme,
    fondement: "date_premiere_immatriculation",
    motif: voie.motif ?? null,
    limites: limitesPour("date_premiere_immatriculation"),
    // Ce que la personne peut préciser pour passer du repli au critère
    // principal. Proposé, jamais exigé.
    precision: "norme_euro",
  };
}

// Dites à chaque fois, sous la classe : elles ne sont pas des réserves de
// style, chacune correspond à un article ou à un silence du texte. La première
// ne vaut que pour un classement de repli — l'afficher sur un classement par
// la norme Euro serait faux.
export const LIMITE_REPLI_DATE =
  "Classement établi d'après la date de première immatriculation, faute de connaître la norme Euro (rubrique V.9 de la carte grise) : c'est le critère de repli prévu par l'arrêté lui-même. La norme Euro, quand elle est connue, prime.";

export const LIMITES_COMMUNES = [
  "Nomenclature de la colonne « Voitures » (catégorie M1). Un utilitaire, un camping-car ou un deux-roues relève d'une autre colonne, que Nexora ne lit pas.",
  "Un dispositif de dépollution installé après la première mise en circulation peut faire classer le véhicule plus haut (article 3).",
  "Les règles de circulation des zones à faibles émissions sont fixées par chaque collectivité : elles ne figurent pas dans cet arrêté, et Nexora ne les connaît pas.",
  "Cette lecture de la nomenclature n'est pas une certification : seul le simulateur officiel fait foi, et seul certificat-air.gouv.fr délivre la vignette.",
];

export function limitesPour(fondement) {
  return fondement === "date_premiere_immatriculation" ? [LIMITE_REPLI_DATE, ...LIMITES_COMMUNES] : [...LIMITES_COMMUNES];
}

// Compatibilité : l'ancien nom désignait la liste du classement par la date.
export const LIMITES = limitesPour("date_premiere_immatriculation");

export const POURQUOI_CARBURANT_HYBRIDE =
  "L'arrêté range les hybrides non rechargeables selon leur carburant : essence d'un côté, gazole de l'autre. La classe n'est pas la même.";
