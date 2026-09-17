// Univers des services Nexora Auto : ce que l'on peut faire pour une voiture.
//
// Trois notions à ne jamais confondre :
// - le SERVICE (la révision, les pneus…) : une seule fiche par prestation ;
// - le MODE de réalisation (chez un professionnel, à domicile, collecte et
//   restitution) : une propriété du service, jamais une prestation de plus ;
// - l'OFFRE réelle (un partenaire, une zone, un mode, un prix) : elle seule
//   rendra un service réservable (lib/auto/offres.js). Il n'en existe aucune
//   aujourd'hui.
//
// Les fiches disent ce que la prestation comprend habituellement et ce qui
// dépend du véhicule. Elles ne recommandent rien à partir de l'âge ou du
// kilométrage, ne posent aucun diagnostic, n'affichent aucun prix.
//
// Pur et testé (services.test.js).

import { dernierKilometrage } from "../../lib/auto/echeances.js";
import { afficherImmatriculation } from "../../lib/auto/immatriculation.js";
import { ENERGIES, formaterDate, formaterKm, libelleDe } from "./format.js";

export const UNIVERS = [
  { code: "entretien", libelle: "Entretien et réparation" },
  { code: "pneus", libelle: "Pneus" },
  { code: "lavage", libelle: "Lavage et esthétique" },
  { code: "controle_technique", libelle: "Contrôle technique" },
  { code: "assistance", libelle: "Assistance" },
];

export const MODES = [
  { code: "chez_un_professionnel", libelle: "Chez un professionnel" },
  { code: "a_domicile", libelle: "À domicile ou au travail" },
  { code: "collecte", libelle: "Collecte et restitution" },
];

const THERMIQUES_ET_HYBRIDES = ["essence", "diesel", "hybride", "hybride_rechargeable", "gpl", "ethanol"];

const oui = (note) => ({ envisageable: true, ...(note ? { note } : {}) });
const non = (note) => ({ envisageable: false, note });

export const SERVICES = [
  {
    code: "revision",
    univers: "entretien",
    nom: "Révision",
    resume: "L'entretien prévu par le constructeur, au rythme de votre carnet.",
    aQuoiSert:
      "Réaliser l'entretien prévu par le constructeur, au rythme indiqué dans le carnet (kilométrage ou durée), pour garder la voiture fiable et son historique à jour.",
    comprend: [
      "Remplacement de l'huile moteur et du filtre à huile (voitures thermiques et hybrides)",
      "Remplacement des filtres prévus à cette échéance : air, habitacle, carburant",
      "Contrôle des niveaux, des freins, des pneus, de l'éclairage et des principaux organes de sécurité",
      "Mise à jour du carnet et remise à zéro de l'indicateur d'entretien",
    ],
    dependDuVehicule: [
      "Les opérations varient selon le kilométrage, l'âge et la motorisation : le carnet du constructeur fait foi.",
      "L'huile doit respecter la norme préconisée pour le moteur.",
      "Certaines échéances ajoutent des opérations plus importantes (courroie de distribution, bougies, liquide de frein) : elles se vérifient dans le carnet ou auprès du professionnel.",
    ],
    informations: ["marque_modele", "motorisation", "energie", "mise_en_circulation", "kilometrage", "derniere_revision", "intervalle_revision"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui("Pour les opérations courantes ; certaines demandent un atelier."), collecte: oui() },
    suiviAPrevoir: "revision",
  },
  {
    code: "vidange",
    univers: "entretien",
    nom: "Vidange et filtre à huile",
    resume: "Renouveler l'huile moteur et son filtre.",
    aQuoiSert: "Renouveler l'huile moteur et son filtre, quand le carnet le prévoit ou à votre demande.",
    comprend: ["Vidange de l'huile moteur", "Remplacement du filtre à huile", "Remplissage avec une huile conforme à la norme du moteur", "Contrôle des niveaux"],
    dependDuVehicule: ["Quantité et norme d'huile selon la motorisation.", "Une vidange ne remplace pas une révision : elle n'en est qu'une partie."],
    informations: ["marque_modele", "motorisation", "energie", "kilometrage", "derniere_vidange"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui(), collecte: oui() },
    energies: THERMIQUES_ET_HYBRIDES,
  },
  {
    code: "freinage",
    univers: "entretien",
    nom: "Freinage",
    resume: "Contrôler l'usure des freins et remplacer les pièces usées.",
    aQuoiSert: "Contrôler l'usure du système de freinage et remplacer les pièces usées, pour votre sécurité.",
    comprend: ["Contrôle de l'usure des plaquettes et des disques", "Remplacement des pièces usées, sur devis", "Contrôle du liquide de frein"],
    dependDuVehicule: [
      "Les pièces dépendent du modèle et de la version exacte.",
      "Un remplacement se décide sur constat d'un professionnel : Nexora ne le recommande pas d'après l'âge ou le kilométrage.",
    ],
    informations: ["marque_modele", "motorisation", "annee", "kilometrage", "symptomes"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui("Selon l'intervention et le professionnel."), collecte: oui() },
  },
  {
    code: "batterie",
    univers: "entretien",
    nom: "Batterie 12 V",
    resume: "Tester et remplacer la batterie de démarrage.",
    aQuoiSert: "Remplacer une batterie de démarrage qui ne tient plus la charge.",
    comprend: ["Test de la batterie et du circuit de charge", "Remplacement par une batterie adaptée au véhicule", "Reprise de l'ancienne batterie pour recyclage"],
    dependDuVehicule: [
      "La technologie dépend du véhicule : batterie standard, EFB ou AGM, notamment avec le Start & Stop.",
      "Certains véhicules demandent une initialisation électronique après le remplacement.",
      "Une batterie qui se décharge peut révéler un autre problème : le test le vérifie.",
    ],
    informations: ["marque_modele", "motorisation", "annee", "start_stop", "symptomes"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui(), collecte: oui() },
  },
  {
    code: "diagnostic",
    univers: "entretien",
    nom: "Diagnostic",
    resume: "Chercher l'origine d'un voyant, d'un bruit ou d'un comportement inhabituel.",
    aQuoiSert: "Rechercher l'origine d'un voyant allumé, d'un bruit ou d'un comportement inhabituel.",
    comprend: ["Lecture des défauts enregistrés par l'électronique du véhicule", "Essais et contrôles selon les symptômes", "Compte rendu de ce qui a été constaté"],
    dependDuVehicule: [
      "Le résultat n'est pas garanti d'avance : certaines pannes demandent des vérifications complémentaires.",
      "Nexora ne pose pas de diagnostic : seul un professionnel le fait, après examen.",
    ],
    informations: ["marque_modele", "motorisation", "annee", "kilometrage", "symptomes"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui("Pour une première lecture des défauts ; certaines recherches demandent un atelier."), collecte: oui() },
  },
  {
    code: "climatisation",
    univers: "entretien",
    nom: "Climatisation",
    resume: "Contrôler et recharger la climatisation.",
    aQuoiSert: "Retrouver une climatisation efficace et vérifier qu'elle fonctionne correctement.",
    comprend: ["Contrôle du fonctionnement et recherche de fuite", "Recharge du circuit avec le gaz réfrigérant adapté", "Remplacement du filtre d'habitacle si nécessaire"],
    dependDuVehicule: ["Le gaz réfrigérant dépend du véhicule.", "Une climatisation qui se vide vite signale une fuite, à réparer avant la recharge."],
    informations: ["marque_modele", "annee", "symptomes"],
    modes: { chez_un_professionnel: oui(), a_domicile: non("Demande un équipement d'atelier."), collecte: oui() },
  },
  {
    code: "pneus_remplacement",
    univers: "pneus",
    nom: "Remplacement de pneus",
    resume: "Remplacer des pneus usés ou endommagés.",
    aQuoiSert: "Remplacer des pneus usés ou endommagés par des pneus adaptés à la voiture.",
    comprend: ["Fourniture de pneus aux dimensions de la voiture", "Démontage, montage et équilibrage", "Remplacement des valves", "Reprise des anciens pneus pour recyclage"],
    dependDuVehicule: [
      "Dimensions, indices de charge et de vitesse : inscrits sur le flanc du pneu.",
      "Type de pneu : été, hiver ou 4 saisons.",
      "Une usure irrégulière peut justifier un contrôle de la géométrie.",
    ],
    informations: ["marque_modele", "dimensions_pneus", "nombre_pneus", "type_pneus"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui("Avec un monteur équipé d'un atelier mobile."), collecte: oui() },
  },
  {
    code: "pneus_saisonniers",
    univers: "pneus",
    nom: "Pneus hiver ou été",
    resume: "Changer de pneus au changement de saison.",
    aQuoiSert: "Passer des pneus été aux pneus hiver, ou l'inverse.",
    comprend: ["Démontage et montage des roues ou des pneus", "Équilibrage si nécessaire", "Contrôle de la pression"],
    dependDuVehicule: ["Pneus montés sur jantes ou non : le travail n'est pas le même.", "Le stockage des pneus démontés dépend du professionnel."],
    informations: ["marque_modele", "dimensions_pneus", "sur_jantes"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui(), collecte: oui() },
  },
  {
    code: "geometrie",
    univers: "pneus",
    nom: "Géométrie et parallélisme",
    resume: "Régler les angles des roues.",
    aQuoiSert: "Régler le parallélisme et les angles des roues, pour une bonne tenue de route et une usure régulière des pneus.",
    comprend: ["Mesure des angles des roues sur banc", "Réglage selon les valeurs du constructeur"],
    dependDuVehicule: ["Certains angles ne se règlent pas sans remplacer des pièces."],
    informations: ["marque_modele", "symptomes"],
    modes: { chez_un_professionnel: oui(), a_domicile: non("Demande un banc de géométrie."), collecte: oui() },
  },
  {
    code: "lavage_complet",
    univers: "lavage",
    nom: "Lavage intérieur et extérieur",
    resume: "Nettoyer la voiture, dedans et dehors.",
    aQuoiSert: "Nettoyer la voiture, dedans et dehors.",
    comprend: ["Lavage de la carrosserie, des jantes et des vitres", "Aspiration de l'intérieur", "Nettoyage des surfaces intérieures"],
    dependDuVehicule: ["Taille du véhicule et état de propreté : poils d'animaux, taches.", "À domicile : un emplacement accessible est nécessaire."],
    informations: ["marque_modele", "etat_interieur", "acces_domicile"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui(), collecte: non("Peu courant pour un lavage.") },
  },
  {
    code: "detailing",
    univers: "lavage",
    nom: "Detailing",
    resume: "Rénover l'aspect de la carrosserie et de l'intérieur.",
    aQuoiSert: "Rénover l'aspect de la carrosserie et de l'intérieur, au-delà d'un lavage.",
    comprend: ["Décontamination et lavage minutieux", "Polissage de la carrosserie selon son état", "Protection de la peinture et rénovation de l'intérieur, selon la formule"],
    dependDuVehicule: ["Le travail dépend de l'état de la peinture et de l'intérieur : il s'estime souvent sur photos."],
    informations: ["marque_modele", "photos"],
    modes: { chez_un_professionnel: oui(), a_domicile: oui("Selon le prestataire et l'emplacement."), collecte: oui() },
  },
  {
    code: "controle_technique",
    univers: "controle_technique",
    nom: "Contrôle technique",
    resume: "Le contrôle obligatoire, dans un centre agréé.",
    aQuoiSert: "Passer le contrôle technique obligatoire, réalisé par un centre agréé, dans les délais.",
    comprend: [
      "Vérification des points fixés par la réglementation",
      "Procès-verbal indiquant le résultat et la date limite du prochain contrôle",
      "Contre-visite en cas de défaillance majeure ou critique, dans les 2 mois",
    ],
    dependDuVehicule: [
      "La périodicité dépend de la catégorie du véhicule ; Nexora applique les règles d'une voiture particulière.",
      "Le résultat et la date limite figurent sur le procès-verbal, qui fait foi.",
    ],
    informations: ["immatriculation", "mise_en_circulation", "dernier_controle", "carte_grise"],
    modes: {
      chez_un_professionnel: oui("Dans un centre de contrôle agréé."),
      a_domicile: non("Le contrôle se passe obligatoirement dans un centre agréé."),
      collecte: oui("Un convoyeur conduit la voiture au centre, puis la ramène."),
    },
    suiviAPrevoir: "controle_technique",
  },
  {
    code: "assistance_panne",
    univers: "assistance",
    nom: "Panne, crevaison ou accident",
    resume: "Les bons réflexes et qui appeler.",
    aQuoiSert: "Savoir quoi faire et qui appeler en cas de panne, de crevaison ou d'accident.",
    comprend: [
      "En cas de danger, mettez-vous en sécurité, hors de la voie de circulation, puis appelez le 112.",
      "Sur autoroute, utilisez une borne d'appel d'urgence ou appelez le 112.",
      "Votre assurance ou le constructeur proposent souvent une assistance : son numéro figure dans vos documents.",
    ],
    dependDuVehicule: [
      "Les garanties d'assistance dépendent de votre contrat d'assurance ou de la garantie constructeur.",
      "Selon le contrat : dépannage sur place ou remorquage vers un garage.",
    ],
    informations: ["immatriculation", "marque_modele", "lieu_panne"],
    // Nexora ne déclenche pas de dépannage : aucun mode, aucune offre possible.
    modes: {},
    assistance: true,
  },
];

export function serviceParCode(code) {
  return SERVICES.find((s) => s.code === code) ?? null;
}

export function servicesDuMode(mode) {
  return mode ? SERVICES.filter((s) => s.modes[mode]?.envisageable) : SERVICES;
}

// ---------------------------------------------------------------------------
// Adapter une fiche à la voiture
// ---------------------------------------------------------------------------

// { etat: "concerne" | "non_concerne" | "a_verifier" | "sans_voiture", texte }
export function compatibilite(service, vehicule) {
  if (!vehicule) return { etat: "sans_voiture", texte: "Choisissez une voiture pour adapter cette fiche." };
  if (!service.energies) return { etat: "concerne", texte: null };
  if (!vehicule.energie || vehicule.energie === "autre") {
    return { etat: "a_verifier", texte: "Énergie non renseignée : la compatibilité reste à vérifier." };
  }
  if (!service.energies.includes(vehicule.energie)) {
    return {
      etat: "non_concerne",
      texte:
        service.code === "vidange"
          ? "Une voiture électrique n'a pas d'huile moteur à vidanger : son entretien suit le programme du constructeur (voir Révision)."
          : `Ne concerne pas une voiture ${libelleDe(ENERGIES, vehicule.energie).toLowerCase()}.`,
    };
  }
  return { etat: "concerne", texte: null };
}

// Précisions liées aux caractéristiques connues. Jamais de recommandation
// fondée sur l'âge ou le kilométrage.
export function remarquesVehicule(service, vehicule) {
  if (!vehicule) return [];
  const remarques = [];
  const electrique = vehicule.energie === "electrique";
  const hybride = vehicule.energie === "hybride" || vehicule.energie === "hybride_rechargeable";
  if (service.code === "revision" && electrique) {
    remarques.push("Voiture électrique : pas de vidange moteur ; le programme d'entretien dépend du constructeur.");
  }
  if (service.code === "revision" && hybride) {
    remarques.push("Voiture hybride : l'entretien concerne le moteur thermique et les éléments électriques, selon le constructeur.");
  }
  if (service.code === "batterie" && (electrique || hybride)) {
    remarques.push("Il s'agit de la batterie 12 V de servitude, pas de la batterie de traction.");
  }
  if (service.code === "controle_technique" && vehicule.energie === "electrique") {
    remarques.push("Une voiture électrique passe le contrôle technique comme les autres voitures particulières.");
  }
  return remarques;
}

// ---------------------------------------------------------------------------
// Informations pour préparer une future offre
// ---------------------------------------------------------------------------

const plusRecente = (historique, type) =>
  historique.filter((h) => h.type === type).sort((a, b) => (a.realise_le < b.realise_le ? 1 : a.realise_le > b.realise_le ? -1 : 0))[0];

// `lire` rend la valeur connue, ou null. `action` : le geste de la fiche
// véhicule qui la renseigne. Sans `lire` : information à préciser le moment
// venu (elle n'est pas conservée dans le dossier).
export const INFORMATIONS = {
  marque_modele: { libelle: "Marque et modèle", lire: (v) => `${v.marque} ${v.modele}` },
  motorisation: { libelle: "Motorisation", lire: (v) => v.motorisation || null, action: "modifier" },
  energie: { libelle: "Énergie", lire: (v) => (v.energie ? libelleDe(ENERGIES, v.energie) : null), action: "modifier" },
  annee: { libelle: "Année", lire: (v) => (v.annee ? String(v.annee) : null), action: "modifier" },
  immatriculation: { libelle: "Immatriculation", lire: (v) => (v.immatriculation ? afficherImmatriculation(v.immatriculation) : null), action: "modifier" },
  mise_en_circulation: {
    libelle: "Première mise en circulation",
    lire: (v) => (v.date_mise_en_circulation ? formaterDate(v.date_mise_en_circulation) : null),
    action: "mise_en_circulation",
  },
  kilometrage: {
    libelle: "Kilométrage",
    lire: (v) => {
      const km = dernierKilometrage({ releves: v.releves ?? [], historique: v.historique ?? [] });
      return km ? `${formaterKm(km.kilometrage)} le ${formaterDate(km.date)}` : null;
    },
    action: "releve",
  },
  derniere_revision: {
    libelle: "Dernière révision",
    lire: (v) => {
      const r = plusRecente(v.historique ?? [], "revision");
      return r ? `${formaterDate(r.realise_le)}${r.kilometrage != null ? ` à ${formaterKm(r.kilometrage)}` : ""}` : null;
    },
    action: "revision",
  },
  intervalle_revision: {
    libelle: "Intervalle de révision du carnet",
    lire: (v) =>
      v.intervalle_entretien_km || v.intervalle_entretien_mois
        ? [v.intervalle_entretien_km ? formaterKm(v.intervalle_entretien_km) : null, v.intervalle_entretien_mois ? `${v.intervalle_entretien_mois} mois` : null].filter(Boolean).join(" ou ")
        : null,
    action: "intervalle",
  },
  derniere_vidange: {
    libelle: "Dernière vidange",
    lire: (v) => {
      const r = plusRecente(v.historique ?? [], "vidange");
      return r ? `${formaterDate(r.realise_le)}${r.kilometrage != null ? ` à ${formaterKm(r.kilometrage)}` : ""}` : null;
    },
    action: "historique",
  },
  dernier_controle: {
    libelle: "Dernier contrôle technique",
    lire: (v) => {
      const c = plusRecente(v.historique ?? [], "controle_technique");
      return c ? formaterDate(c.realise_le) : null;
    },
    action: "controle",
  },
  carte_grise: { libelle: "Carte grise et dernier procès-verbal, à présenter au centre" },
  symptomes: { libelle: "Ce que vous constatez : voyant, bruit, vibration, depuis quand" },
  start_stop: { libelle: "Présence du Start & Stop" },
  dimensions_pneus: { libelle: "Dimensions des pneus, inscrites sur le flanc (ex. 205/55 R16 91V)" },
  nombre_pneus: { libelle: "Nombre de pneus à remplacer" },
  type_pneus: { libelle: "Type souhaité : été, hiver ou 4 saisons" },
  sur_jantes: { libelle: "Pneus montés sur jantes ou non" },
  etat_interieur: { libelle: "État de l'intérieur : poils d'animaux, taches" },
  acces_domicile: { libelle: "Pour une intervention à domicile : emplacement et accès" },
  photos: { libelle: "Quelques photos de l'état actuel" },
  lieu_panne: { libelle: "Où vous êtes : adresse, sortie ou point kilométrique" },
};

// { connues: [{ cle, libelle, valeur }], aCompleter: [{ cle, libelle, action }], aPreciser: [{ cle, libelle }] }
export function informationsService(service, vehicule) {
  const resultat = { connues: [], aCompleter: [], aPreciser: [] };
  for (const cle of service.informations) {
    const info = INFORMATIONS[cle];
    if (!info.lire) {
      resultat.aPreciser.push({ cle, libelle: info.libelle });
      continue;
    }
    const valeur = vehicule ? info.lire(vehicule) : null;
    if (valeur) resultat.connues.push({ cle, libelle: info.libelle, valeur });
    else resultat.aCompleter.push({ cle, libelle: info.libelle, action: info.action ?? null });
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Lien avec « À prévoir »
// ---------------------------------------------------------------------------

// Ce que « À prévoir » contient déjà pour ce service et cette voiture :
// - { type: "echeance", element } : révision ou contrôle technique, calculés ;
// - { type: "tache", tache } : une action ouverte déjà ajoutée ;
// - null : rien, l'ajout est possible (sauf pour l'assistance).
export function actionExistante(service, vehicule, { elements = [], taches = [] } = {}) {
  if (!vehicule) return null;
  if (service.suiviAPrevoir) {
    const element = elements.find((el) => el.genre === service.suiviAPrevoir && el.vehicule.id === vehicule.id);
    return element ? { type: "echeance", element } : null;
  }
  const tache = taches.find((t) => t.statut !== "terminee" && t.vehicule_id === vehicule.id && t.service_code === service.code);
  return tache ? { type: "tache", tache } : null;
}

// Comment « À prévoir » suit un service : "echeance" (calculée, révision et
// contrôle technique), "tache" (ajoutée par la personne), "aucun"
// (assistance). Recopié dans la table auto_services (migration 000600).
export function suiviDe(service) {
  if (service.suiviAPrevoir) return "echeance";
  if (service.assistance) return "aucun";
  return "tache";
}

export function peutAjouterAuxActions(service, vehicule, existante) {
  return Boolean(
    vehicule && !vehicule.archive_le && suiviDe(service) === "tache" && !existante && compatibilite(service, vehicule).etat !== "non_concerne",
  );
}
