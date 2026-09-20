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
// Nexora n'a jamais la rubrique V.9 : elle applique donc le second critère,
// qui est celui prévu par le texte, et le dit.
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
export const SITE_OFFICIEL = "https://www.certificat-air.gouv.fr/";

// Annexe I, colonne « VOITURES », transcrite telle quelle. Les bornes sont
// celles du texte ; `debut`/`fin` sont inclusives et expriment la date de
// première immatriculation. Les cellules vides du tableau (classes 4 et 5 en
// essence) n'existent pas ici : c'est le texte qui est ainsi.
export const NOMENCLATURE_VOITURES = {
  essence: [
    { classe: "1", norme: "EURO 5 et 6", debut: "2011-01-01", fin: null },
    { classe: "2", norme: "EURO 4", debut: "2006-01-01", fin: "2010-12-31" },
    { classe: "3", norme: "EURO 2 et 3", debut: "1997-01-01", fin: "2005-12-31" },
    { classe: "non_classe", norme: "EURO 1 et avant", debut: null, fin: "1996-12-31" },
  ],
  diesel: [
    { classe: "2", norme: "EURO 5 et 6", debut: "2011-01-01", fin: null },
    { classe: "3", norme: "EURO 4", debut: "2006-01-01", fin: "2010-12-31" },
    { classe: "4", norme: "EURO 3", debut: "2001-01-01", fin: "2005-12-31" },
    { classe: "5", norme: "EURO 2", debut: "1997-01-01", fin: "2000-12-31" },
    { classe: "non_classe", norme: "EURO 1 et avant", debut: null, fin: "1996-12-31" },
  ],
};

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

// { etat: "classe", classe, libelle, couleur, norme, fondement, limites }
// { etat: "donnees_insuffisantes", manques: [...], question? }
// { etat: "non_applicable", raison }
export function classerCritair({ energie, dateMiseEnCirculation } = {}) {
  const manques = [];
  if (!energie) manques.push("energie");
  if (!estIso(dateMiseEnCirculation)) manques.push("date_mise_en_circulation");
  if (manques.length > 0) return { etat: "donnees_insuffisantes", manques };

  // Une hybride non rechargeable se classe d'après son carburant : l'arrêté
  // range EH (essence-électricité) avec les essence et GH (gazole-électricité)
  // avec les diesel. Plutôt que d'ajouter une question au formulaire, on rend
  // les DEUX réponses : la personne reconnaît la sienne d'un coup d'œil, et
  // Nexora n'a toujours rien affirmé.
  if (energie === "hybride") {
    const alternatives = ["essence", "diesel"].map((carburant) => {
      const r = classerCritair({ energie: carburant, dateMiseEnCirculation });
      return { carburant, classe: r.classe ?? null, libelle: r.libelle ?? null };
    });
    return { etat: "donnees_insuffisantes", manques: ["carburant_hybride"], alternatives };
  }

  const voie = COLONNE_PAR_ENERGIE[energie];
  if (!voie) return { etat: "non_applicable", raison: "energie_hors_nomenclature" };

  const jour = dateMiseEnCirculation.slice(0, 10);

  if (voie.classeDirecte) {
    return {
      etat: "classe",
      classe: voie.classeDirecte,
      ...CLASSES[voie.classeDirecte],
      norme: null,
      fondement: "energie",
      motif: voie.motif,
      limites: LIMITES,
    };
  }

  const ligne = NOMENCLATURE_VOITURES[voie.colonne].find((l) => dansLaPeriode(jour, l));
  if (!ligne) return { etat: "non_applicable", raison: "date_hors_tableau" };

  return {
    etat: "classe",
    classe: ligne.classe,
    ...CLASSES[ligne.classe],
    norme: ligne.norme,
    fondement: "date_premiere_immatriculation",
    motif: voie.motif ?? null,
    limites: LIMITES,
  };
}

// Dites à chaque fois, sous la classe : elles ne sont pas des réserves de
// style, chacune correspond à un article ou à un silence du texte.
export const LIMITES = [
  "Classement établi d'après la date de première immatriculation, faute de connaître la norme Euro inscrite sur la carte grise (rubrique V.9) : c'est le critère prévu par l'arrêté lui-même.",
  "Un dispositif de dépollution installé après la première mise en circulation peut faire classer le véhicule plus haut (article 3).",
  "Les règles de circulation des zones à faibles émissions sont fixées par chaque collectivité : elles ne figurent pas dans cet arrêté, et Nexora ne les connaît pas.",
];

export const POURQUOI_CARBURANT_HYBRIDE =
  "L'arrêté range les hybrides non rechargeables selon leur carburant : essence d'un côté, gazole de l'autre. La classe n'est pas la même.";
