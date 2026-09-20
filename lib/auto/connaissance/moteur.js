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

import { POURQUOI_CARBURANT_HYBRIDE, SIMULATEUR_OFFICIEL, SITE_OFFICIEL, classerCritair } from "./critair.js";
import { analyserLibelleModele, campagnesPour, normaliser } from "./campagnes.js";
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

// Une précision n'est pas un manque : sans elle, Nexora répond quand même.
// Elle est proposée seulement là où elle changerait la réponse.
// Nexora ne stocke pas encore la norme Euro : elle ne l'a jamais demandée, et
// lui ajouter un champ obligatoire serait exactement ce qu'on cherche à
// éviter. Le moteur sait pourtant s'en servir (critair.js), et le jour où une
// carte grise sera lue, la règle est déjà la bonne.
//
// En attendant, on ne fait pas semblant : on dit que le classement repose sur
// le repli, ce que cela peut coûter, et on renvoie à l'outil qui, lui, prend
// la norme en compte.
export const PRECISIONS = {
  norme_euro: {
    cle: "norme_euro",
    libelle: "Cette classe peut être trop favorable",
    pourquoi:
      "L'arrêté classe d'abord d'après la norme Euro (rubrique V.9 de la carte grise), et seulement à défaut d'après la date. Nexora n'a pas cette norme : une voiture réceptionnée sous une norme plus ancienne que sa date ne le suggère descend d'une classe. Le simulateur officiel, lui, la prend en compte.",
  },
};

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
  const r = classerCritair({
    energie: vehicule.energie,
    dateMiseEnCirculation: vehicule.date_mise_en_circulation,
    normeEuro: vehicule.norme_euro,
  });

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
  if (r.fondement === "norme_euro") faits.push({ cle: "norme_euro", valeur: `Euro ${r.normeUtilisee}` });
  if (r.fondement === "date_premiere_immatriculation") faits.push({ cle: "date_mise_en_circulation", valeur: vehicule.date_mise_en_circulation });

  // Classer sur la date, c'est ESTIMER : l'arrêté ne l'autorise qu'à défaut de
  // la norme Euro, et deux voitures immatriculées le même jour peuvent avoir
  // été réceptionnées sous des normes différentes. Le dire est indispensable :
  // une classe trop favorable expose à une amende. Les colonnes E et 1, elles,
  // ne dépendent d'aucune date : là, il n'y a rien à estimer.
  const estimation = r.fondement === "date_premiere_immatriculation";

  return {
    ...base,
    etat: "applicable",
    resume:
      r.classe === "non_classe"
        ? "Cette voiture n'est pas classée par la nomenclature."
        : estimation
          ? `D'après sa date de première immatriculation, cette voiture relèverait de la ${r.libelle}.`
          : `Cette voiture relève de la ${r.libelle}.`,
    valeur: { classe: r.classe, libelle: r.libelle, couleur: r.couleur, norme: r.norme, fondement: r.fondement, estimation },
    faitsUtilises: faits,
    // La réserve détaillée rejoint les limites dépliables : à l'écran, seule
    // la ligne courte « estimation, d'après la date » reste visible. La fiche
    // était devenue de la documentation technique (constat du 20 septembre).
    limites: r.precision === "norme_euro" ? [PRECISIONS.norme_euro.pourquoi, ...r.limites] : r.limites,
    liens: [
      { libelle: "Vérifier sur le simulateur officiel", url: SIMULATEUR_OFFICIEL },
      { libelle: "Commander la vignette", url: SITE_OFFICIEL },
    ],
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
      liens: [{ libelle: "Consulter rappel.conso.gouv.fr", url: "https://rappel.conso.gouv.fr/" }],
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
  if (r.etat === "aucune_fiche") {
    return {
      ...base,
      etat: "non_applicable",
      resume: "Aucune fiche de cette base ne nomme ce modèle.",
      // « Aucune fiche » et « aucun rappel » sont deux choses différentes, et
      // les confondre serait la plus dangereuse des simplifications.
      limites: [
        "Ce n'est pas la preuve qu'aucun rappel ne concerne votre voiture : Nexora ne lit qu'une base, et une base ne prouve pas une absence.",
        "Seul le constructeur peut répondre pour un véhicule précis, à partir de son numéro de série.",
      ],
      verification: VERIFICATION_VIN(vehicule),
      total: 0,
    };
  }

  // Ce que le résumé doit dire, et dans cet ordre : combien de fiches nomment
  // ce modèle, puis que cela ne dit rien de CETTE voiture. Le détail par
  // niveau de correspondance a disparu d'ici : « 2 exactement ce modèle » se
  // lisait comme une compatibilité plus forte qu'une simple concordance de
  // nom (constat de Baptiste, en Production, le 20 septembre 2026). Les
  // comptes vivent maintenant sur les boutons qui déplient chaque groupe.
  const nombre = r.principales.length;
  const voisines = r.voisines.length;

  const resume =
    nombre > 0
      ? `${nombre} fiche${nombre > 1 ? "s" : ""} publiée${nombre > 1 ? "s" : ""} nomme${nombre > 1 ? "nt" : ""} « ${r.terme} ». Nexora ne peut pas savoir si votre voiture est concernée : cela se vérifie avec son numéro de série.`
      : voisines > 0
        ? `Aucune fiche ne nomme « ${r.terme} » directement. ${voisines} nomme${voisines > 1 ? "nt" : ""} une version voisine.`
        : `${r.ecartees.length} fiche${r.ecartees.length > 1 ? "s" : ""} nomme${r.ecartees.length > 1 ? "nt" : ""} ce modèle, hors de la période de fabrication de votre voiture.`;

  return {
    ...base,
    etat: "a_verifier",
    resume,
    valeur: {
      principales: r.principales,
      voisines: r.voisines,
      ecartees: r.ecartees,
      total: r.total,
      tronque: campagnes.tronque ?? false,
      terme: r.terme,
      precision: r.precision,
      exactes: r.exactes,
      generations: r.generations,
    },
    faitsUtilises: [{ cle: "marque_modele", valeur: `${vehicule.marque} ${vehicule.modele}` }],
    verification: VERIFICATION_VIN(vehicule),
    limites: [
      "Une fiche nommant le modèle n'est pas un rappel confirmé pour votre voiture : seul le constructeur tranche, à partir du numéro de série.",
      "Le modèle est un texte libre dans les fiches officielles : une fiche peut viser une autre version du même nom.",
      "La période affichée est une période de fabrication ou de commercialisation. Votre date, elle, est une date d'immatriculation : les deux ne coïncident pas, et l'écart se compte en mois.",
      r.precision === "moins_precise"
        ? `Aucune fiche ne nomme exactement « ${vehicule.modele} » : la recherche a porté sur « ${r.terme} ». Elle est donc moins précise, et peut ramener d'autres véhicules.`
        : null,
      campagnes.tronque ? "Seules les campagnes les plus récentes de cette marque ont été lues." : null,
    ].filter(Boolean),
  };
}

// Où vérifier, pour de vrai, si CETTE voiture est concernée.
//
// Chaque adresse ci-dessous a été ouverte et lue le 20 septembre 2026 : elle
// existe, elle ne demande pas de compte, et elle prend un numéro de série.
// Aucune n'a été devinée à partir d'un motif d'URL.
//
// Nexora n'y transmet RIEN : elle ouvre la page, la personne saisit son
// numéro elle-même. Plusieurs de ces formulaires ajoutent un code image, qui
// interdirait de toute façon l'automatisation — et c'est très bien ainsi.
export const VERIFICATIONS_OFFICIELLES = {
  opel: { url: "https://www.opel.fr/apres-vente/campagne-de-rappel.html", editeur: "Opel France", captcha: true },
  peugeot: { url: "https://www.peugeot.fr/tools/campagnes-de-rappel.html", editeur: "Peugeot France", captcha: true },
  citroen: { url: "https://www.citroen.fr/entretenir/campagnes-de-rappel.html", editeur: "Citroën France", captcha: true },
  renault: { url: "https://www.renault.fr/rappel-renault.html", editeur: "Renault France", captcha: false, groupe: "Renault, Dacia, Alpine et Mobilize" },
  dacia: { url: "https://www.renault.fr/rappel-renault.html", editeur: "Renault France", captcha: false, groupe: "Renault, Dacia, Alpine et Mobilize" },
  toyota: { url: "https://www.toyota.fr/votre-toyota/entretien/formulaire-campagne-de-rappel", editeur: "Toyota France", captcha: false },
};

export function verificationOfficielle(marque) {
  return VERIFICATIONS_OFFICIELLES[normaliser(marque)] ?? null;
}

// Le bloc qui conclut la carte des rappels. Quand la marque a un vérificateur
// officiel, il mène droit dessus ; sinon il dit honnêtement qu'il faut passer
// par le réseau, et renvoie aux fiches officielles.
function VERIFICATION_VIN(vehicule) {
  const officielle = verificationOfficielle(vehicule.marque);
  const ou = officielle
    ? `${officielle.editeur} met en ligne un vérificateur : vous y saisissez votre numéro, et il répond pour votre voiture.`
    : `Avec lui, le réseau ${vehicule.marque} dit si votre voiture est concernée — c'est la seule réponse qui vaille pour elle.`;

  return {
    titre: "Vérifier pour votre voiture",
    texte: `Votre numéro de série (VIN) est en case E de la carte grise. ${ou}`,
    // Dit d'avance, pour que la page ne surprenne pas.
    note: [
      officielle?.captcha ? "Un code image vous sera demandé sur cette page." : null,
      officielle?.groupe ? `Ce formulaire couvre ${officielle.groupe}.` : null,
      "Nexora n'envoie pas votre numéro : vous le saisissez vous-même sur le site du constructeur.",
    ]
      .filter(Boolean)
      .join(" "),
    lien: officielle
      ? { libelle: `Vérifier sur le site ${officielle.editeur}`, url: officielle.url, principal: true }
      : { libelle: "Toutes les fiches officielles sur rappel.conso.gouv.fr", url: "https://rappel.conso.gouv.fr/" },
  };
}

// ---------------------------------------------------------------------------
// Règle 3 — l'entretien : programme du constructeur, ou repère de marque
// ---------------------------------------------------------------------------
//
// Trois niveaux, et ils ne se valent pas. Les confondre serait refaire
// l'erreur du 18 septembre.
//
// 1. PROGRAMME — le constructeur publie des opérations et leurs intervalles
//    POUR UN MODÈLE NOMMÉ, sur une page publique. Deux cas connus au
//    20 septembre 2026 : Tesla Model 3 et Model Y.
// 2. REPÈRE DE MARQUE — le constructeur publie une périodicité pour « ses »
//    véhicules, sans nommer de modèle ni de motorisation (Volkswagen). C'est
//    une indication, pas une préconisation pour CETTE voiture, et l'écran doit
//    le dire. Aucune échéance ne s'en déduit.
// 3. RIEN — le constructeur renvoie au carnet papier (Renault, Dacia,
//    Peugeot), ou exige un VIN et un abonnement (Citroën). On le dit, avec la
//    barrière rencontrée.
//
// L'appariement se fait sur la marque et le nom de modèle lu — pas sur une
// colonne de variante qui n'existe pas. Ajouter un programme reste une
// décision documentée : chaque entrée porte sa clé de source.

const nomDuModele = (modele) => analyserLibelleModele(modele).nom;

// Deux choses à ne jamais confondre dans une opération publiée :
//
// - `depuis` — son POINT DE DÉPART. Il n'y en a pas qu'un. Le contrôle
//   technique part de la mise en circulation quand aucun contrôle n'a eu lieu
//   (c'est déjà ce que fait lib/auto/echeances.js) ; un filtre part de la
//   dernière fois qu'on l'a changé ; une permutation de pneus se déclenche
//   aussi sur un simple constat d'usure. Écrire « toute échéance a besoin de
//   la dernière intervention » serait faux, et ferait demander des
//   informations dont le calcul n'a pas besoin.
//
// - `condition` — et elle a DEUX natures. Une condition de `frequence` dit
//   que l'intervalle peut être plus court ; l'opération, elle, s'applique.
//   Une condition d'`applicabilite` dit qu'on ne sait pas si l'opération
//   concerne cette voiture : « selon équipement », « fabriqués avant 2021
//   environ », « uniquement là où les routes sont salées ». Ces deux-là ne
//   peuvent pas porter la même étiquette — une réserve générale ne rend pas
//   applicable ce qui reste à vérifier.
//
// `besoin` dit ce qu'il faudrait pour DATER cette opération-là, et rien de
// plus : une date, un kilométrage, ou rien quand c'est un contrôle.

export const PROGRAMMES = [
  {
    cle: "tesla_model_3",
    correspond: { marque: "tesla", modeles: ["model 3", "model3"] },
    source: "tesla-entretien-model3",
    portee: "Tesla Model 3. La page ne distingue ni millésime ni version, sauf là où c'est écrit ci-dessus.",
    operations: [
      {
        libelle: "Liquide de frein : contrôle (remplacement au besoin)",
        intervalle: { mois: 48 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "frequence", texte: "Remorquage, descentes de montagne, conduite sportive, environnement chaud et humide : contrôles plus fréquents." },
      },
      {
        libelle: "Filtre à air d'habitacle : remplacement",
        intervalle: { mois: 24 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "frequence", texte: "Tous les ans en Chine." },
      },
      { libelle: "Balais d'essuie-glace : remplacement", intervalle: { mois: 12 }, depuis: "derniere_operation", besoin: ["date"] },
      {
        libelle: "Étriers de frein : nettoyage et graissage",
        intervalle: { mois: 12, km: 20000 },
        depuis: "derniere_operation",
        besoin: ["date", "kilometrage"],
        condition: { nature: "applicabilite", texte: "Uniquement dans les régions où les routes sont salées en hiver. Nexora ne sait pas où vous roulez." },
      },
      {
        libelle: "Permutation des pneus",
        intervalle: { km: 10000 },
        depuis: "derniere_operation_ou_controle",
        besoin: ["kilometrage"],
        condition: { nature: "frequence", texte: "Ou dès 1,5 mm d'écart de profondeur entre les pneus, selon ce qui arrive en premier : ce déclencheur-là se constate, il ne se date pas." },
      },
      {
        libelle: "Sachet de déshydratant de la climatisation : remplacement",
        intervalle: { mois: 72 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "applicabilite", texte: "Véhicules fabriqués avant 2021 environ. Nexora connaît votre date d'immatriculation, pas celle de fabrication — et « environ » n'est pas une date." },
      },
    ],
    reserves: [
      "Tesla introduit sa liste par « s'ils s'appliquent à votre véhicule ». Les opérations marquées « à vérifier » ci-dessus sont celles dont Nexora ne peut pas trancher l'applicabilité.",
      "Tesla ajoute que cette liste n'est pas exhaustive et n'inclut pas les consommables — tout en y faisant figurer les balais d'essuie-glace. Nexora affiche la liste telle qu'elle est publiée, sans trancher cette contradiction.",
      "La page ne précise aucun point de départ pour la PREMIÈRE occurrence de chaque opération.",
    ],
  },
  {
    cle: "tesla_model_y",
    correspond: { marque: "tesla", modeles: ["model y", "modely"] },
    source: "tesla-entretien-modely",
    portee: "Tesla Model Y. La page ne distingue ni millésime ni version, sauf là où c'est écrit ci-dessus.",
    operations: [
      {
        libelle: "Liquide de frein : contrôle (remplacement au besoin)",
        intervalle: { mois: 48 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "frequence", texte: "Remorquage, descentes de montagne, conduite sportive, environnement chaud et humide : contrôles plus fréquents." },
      },
      {
        libelle: "Filtre à air d'habitacle : remplacement",
        intervalle: { mois: 24 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "frequence", texte: "Tous les 3 ans pour le filtre HEPA et les filtres à charbon, selon équipement ; tous les ans en Chine." },
      },
      {
        libelle: "Filtre HEPA : remplacement",
        intervalle: { mois: 36 },
        depuis: "derniere_operation",
        besoin: ["date"],
        condition: { nature: "applicabilite", texte: "Selon équipement. La page ne dit pas comment savoir si votre voiture en a un." },
      },
      { libelle: "Balais d'essuie-glace : remplacement", intervalle: { mois: 12 }, depuis: "derniere_operation", besoin: ["date"] },
      {
        libelle: "Étriers de frein : nettoyage et graissage",
        intervalle: { mois: 12, km: 20000 },
        depuis: "derniere_operation",
        besoin: ["date", "kilometrage"],
        condition: { nature: "applicabilite", texte: "Uniquement dans les régions où les routes sont salées en hiver. Nexora ne sait pas où vous roulez." },
      },
      {
        libelle: "Permutation des pneus",
        intervalle: { km: 10000 },
        depuis: "derniere_operation_ou_controle",
        besoin: ["kilometrage"],
        condition: { nature: "frequence", texte: "Ou dès 1,5 mm d'écart de profondeur entre les pneus, selon ce qui arrive en premier : ce déclencheur-là se constate, il ne se date pas." },
      },
    ],
    reserves: [
      "Tesla introduit sa liste par « s'ils s'appliquent à votre véhicule ». Les opérations marquées « à vérifier » ci-dessus sont celles dont Nexora ne peut pas trancher l'applicabilité.",
      "Tesla ajoute que cette liste n'est pas exhaustive et n'inclut pas les consommables — tout en y faisant figurer les balais d'essuie-glace. Nexora affiche la liste telle qu'elle est publiée, sans trancher cette contradiction.",
      "La page ne précise aucun point de départ pour la PREMIÈRE occurrence de chaque opération.",
    ],
  },
];

// Ce qu'une opération réclame pour être datée, dit en une phrase et seulement
// pour celle-là. Rien de global : le contrôle technique, lui, se calcule sans
// aucune intervention passée.
export const DEPARTS = {
  derniere_operation: "à partir de la dernière fois qu'elle a été faite",
  derniere_operation_ou_controle: "à partir de la dernière fois, ou d'un simple contrôle d'usure",
};

export function applicabiliteOperation(operation) {
  return operation?.condition?.nature === "applicabilite" ? "a_verifier" : "publiee";
}

// Ce que le constructeur publie pour SES véhicules, sans nommer de modèle.
// Affiché comme un repère, jamais converti en échéance.
export const REPERES_MARQUE = [
  {
    cle: "volkswagen",
    marque: "volkswagen",
    source: "volkswagen-plan-entretien",
    texte: "Volkswagen publie, pour ses véhicules et sans distinguer les modèles : entretien annuel ou 15 000 km. Une formule « Long Life » peut espacer l'entretien jusqu'à 30 000 km ou 2 ans, après avis d'un conseiller.",
  },
];

// Ce qui bloque, marque par marque, quand on a cherché et trouvé une barrière.
// Dire « on n'a pas trouvé » et « c'est derrière un VIN et un abonnement » ne
// sont pas la même information.
export const BARRIERES = {
  renault: "Les notices Renault sont publiques, mais la périodicité n'y figure pas : elles renvoient au document d'entretien du véhicule, c'est-à-dire au carnet papier.",
  dacia: "Les notices Dacia sont publiques, mais la périodicité n'y figure pas : elles renvoient au document d'entretien du véhicule, c'est-à-dire au carnet papier.",
  peugeot: "Le guide Peugeot public ne contient pas de chapitre « plan d'entretien ». Le seul outil qui l'afficherait demande l'immatriculation ou le numéro de série.",
  citroen: "Le plan d'entretien Citroën est derrière un numéro de VIN ET un espace « Services abonnés ».",
  toyota: "Toyota publie une périodicité de marque (« tous les 15 000 km ou tous les ans, variable selon les modèles ») et renvoie au carnet d'entretien pour le détail.",
};

export function programmePour(vehicule, programmes = PROGRAMMES) {
  const marque = normaliser(vehicule?.marque);
  const nom = nomDuModele(vehicule?.modele ?? "");
  if (!marque || !nom) return null;
  return programmes.find((p) => p.correspond.marque === marque && p.correspond.modeles.includes(nom)) ?? null;
}

export function repereMarquePour(vehicule, reperes = REPERES_MARQUE) {
  const marque = normaliser(vehicule?.marque);
  return marque ? (reperes.find((r) => r.marque === marque) ?? null) : null;
}

function regleEntretien(vehicule, programmes, reperes) {
  const base = { cle: "programme_entretien", titre: "Entretien du constructeur", categorie: "entretien", source: null };

  const programme = programmePour(vehicule, programmes);
  if (programme) {
    const aVerifier = programme.operations.filter((o) => applicabiliteOperation(o) === "a_verifier").length;
    const publiees = programme.operations.length - aVerifier;
    return {
      ...base,
      etat: "applicable",
      source: programme.source,
      // « Publié pour ce modèle » et « applicable à cette voiture » ne sont pas
      // la même chose, et le résumé le dit avant tout le reste.
      resume:
        aVerifier === 0
          ? `${vehicule.marque} publie ${publiees} opérations d'entretien pour ce modèle, avec leurs intervalles.`
          : `${vehicule.marque} publie ${programme.operations.length} opérations d'entretien pour ce modèle. ${aVerifier} d'entre elles dépendent d'une condition que Nexora ne peut pas vérifier pour votre voiture.`,
      valeur: { niveau: "programme", operations: programme.operations, portee: programme.portee, publiees, aVerifier },
      // Un intervalle dit à quelle FRÉQUENCE une opération revient, pas à
      // quelle date elle tombe chez vous. Et chaque ligne a son propre point
      // de départ : écrire que toute échéance réclame la dernière intervention
      // serait faux — le contrôle technique, juste au-dessus, se calcule à
      // partir de la mise en circulation quand aucun contrôle n'a eu lieu.
      avertissement:
        "Ces intervalles disent à quelle fréquence une opération revient, pas à quelle date elle tombe chez vous : chacune a son propre point de départ, indiqué ligne par ligne. Enregistrez une opération dans l'historique et Nexora en suivra l'échéance.",
      faitsUtilises: [{ cle: "marque_modele", valeur: `${vehicule.marque} ${vehicule.modele}` }],
      limites: [...(programme.reserves ?? []), "Les intervalles publiés valent pour des usages types."],
    };
  }

  const repere = repereMarquePour(vehicule, reperes);
  if (repere) {
    return {
      ...base,
      etat: "a_preciser",
      source: repere.source,
      resume: repere.texte,
      valeur: { niveau: "repere_marque" },
      limites: [
        "C'est un repère de marque, pas la préconisation de VOTRE voiture : la page ne nomme ni modèle ni motorisation. Votre carnet d'entretien fait foi.",
        "Nexora n'en déduit aucune échéance. Renseignez l'intervalle de votre carnet et elle calculera la prochaine révision.",
      ],
    };
  }

  const barriere = BARRIERES[normaliser(vehicule?.marque)] ?? null;
  const intervalleRenseigne = Number.isFinite(vehicule?.intervalle_entretien_km) || Number.isFinite(vehicule?.intervalle_entretien_mois);
  return {
    ...base,
    etat: "indisponible",
    resume: intervalleRenseigne
      ? "Nexora n'a pas trouvé de programme publié pour cette voiture dans les sources qu'elle a examinées : votre suivi repose sur l'intervalle de votre carnet."
      : "Nexora n'a pas trouvé de programme publié pour cette voiture dans les sources qu'elle a examinées. L'intervalle se lit sur votre carnet d'entretien.",
    raison: barriere ? "barriere_constructeur" : "non_recherchee",
    limites: [
      barriere,
      "Les périodicités dépendent de la motorisation exacte : les publier sans la bonne version produirait une échéance fausse.",
      "Cette absence est celle des sources examinées à ce jour, pas une preuve qu'aucun programme n'existe.",
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// L'assemblage
// ---------------------------------------------------------------------------

// L'ordre des cartes : ce qui est établi ou à vérifier d'abord, ce qui
// manque ensuite, ce qui est indisponible en dernier. Une carte
// « indisponible » ne doit jamais dominer un écran.
const RANG_ETATS = { a_verifier: 0, applicable: 1, a_preciser: 2, donnees_insuffisantes: 3, non_applicable: 4, indisponible: 5, source_a_relire: 6 };

// { connaissances, aVerifier, manques, questions, sourcesARelire }
//
// `campagnes` vient de campagnes-serveur.js ; `null` signifie « pas consultée »,
// ce qui n'est pas la même chose que « aucune campagne ».
export function connaissancesDe({ vehicule, campagnes = null, aujourdhui, programmes = PROGRAMMES, reperes = REPERES_MARQUE, sources = SOURCES } = {}) {
  if (!vehicule) return { connaissances: [], aVerifier: [], manques: [], sourcesARelire: [] };

  const perimees = new Set(aujourdhui ? sourcesAVerifier(aujourdhui, sources) : []);

  const brutes = [regleCampagnes(vehicule, campagnes), regleCritair(vehicule), regleEntretien(vehicule, programmes, reperes)];

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

// Combien de fiches méritent d'être regardées, pour la ligne de l'accueil.
//
// Elle existe parce que l'accueil lisait `valeur.retenues` en direct : le jour
// où ce champ a été remplacé par `principales`/`voisines`, l'accueil a cessé
// de s'afficher. Un accès unique et testé vaut mieux qu'un champ recopié.
//
// Ne compte que les fiches qui nomment le modèle : une version voisine n'a
// rien à faire sur l'accueil.
export function nombreFichesAVerifier(connaissances = []) {
  const c = connaissances.find((x) => x.cle === "campagnes_rappel");
  return c?.etat === "a_verifier" ? (c.valeur?.principales?.length ?? 0) : 0;
}

// La citation à déplier sous une connaissance. Séparée pour que l'écran ne
// fabrique jamais une référence lui-même.
export function referenceDe(connaissance) {
  return connaissance?.source ? citation(connaissance.source) : null;
}
