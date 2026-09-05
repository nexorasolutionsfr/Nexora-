// Offres d'abonnement Nexora — source unique.
//
// Ce fichier est lu par la page tarifaire ET par la route de paiement. Un
// tarif affiché qui diffère du tarif facturé est le genre d'écart qui se
// découvre sur un relevé bancaire, donc les deux lisent la même ligne.
//
// PAS DE TVA. L'éditeur est en franchise en base (article 293 B du CGI) : les
// montants ci-dessous sont ceux réellement payés, et il ne faut afficher ni
// « HT », ni « TTC », ni ajouter de taxe au paiement. C'est aussi un argument :
// le garage paie le prix affiché, sans supplément.

export type Periodicite = "mensuel" | "annuel";

export type Offre = {
  cle: string;
  nom: string;
  accroche: string;
  prixMensuel: number;
  /** Payé en une fois pour douze mois. Deux mois offerts. */
  prixAnnuel: number;
  pour: string;
  inclus: string[];
  /** L'offre mise en avant. Une seule, sinon la mise en avant ne veut plus rien dire. */
  recommandee?: boolean;
};

// RÈGLE : chaque ligne de `inclus` doit désigner une fonctionnalité qui existe
// EN PRODUCTION, aujourd'hui. Deux promesses ont dû être retirées le
// 2026-09-05 parce qu'elles n'existaient nulle part dans le code livré :
//
//   - « 1 / 3 / utilisateurs illimités » : aucun multi-utilisateurs. Chaque
//     garage a un seul compte, celui du propriétaire. Le chantier « accès
//     salariés » vit sur Test et n'est pas fusionné.
//   - « Relances automatiques des devis sans réponse » : les tables
//     revenue_recovery_* existent en base, mais aucun écran ne les utilise.
//
// Une grille tarifaire est un engagement contractuel : ce qui y figure doit
// être livrable le jour où quelqu'un paie.
export const JOURS_ESSAI = 14;

export const OFFRES: Offre[] = [
  {
    cle: "essentiel",
    nom: "Essentiel",
    accroche: "Le quotidien, tenu.",
    prixMensuel: 79,
    prixAnnuel: 790,
    pour: "Garage d'une à deux personnes",
    inclus: [
      "Agenda et prise de rendez-vous",
      "Clients et véhicules",
      "Dossier véhicule et historique",
      "Devis détaillés, ligne par ligne",
      "Factures et suivi des règlements",
      "Reprise de votre ancienne base",
    ],
  },
  {
    cle: "atelier",
    nom: "Atelier",
    accroche: "Le client voit, l'atelier avance.",
    prixMensuel: 129,
    prixAnnuel: 1290,
    pour: "Garage de trois à cinq personnes",
    recommandee: true,
    inclus: [
      "Tout l'Essentiel",
      "Contrôle véhicule avec photos",
      "Lien client sans compte à créer",
      "Tableau atelier en direct",
      "Ordres de réparation",
      "Demandes entrantes centralisées",
    ],
  },
  {
    cle: "atelier-plus",
    nom: "Atelier +",
    accroche: "Rien ne se perd.",
    prixMensuel: 199,
    prixAnnuel: 1990,
    pour: "Garage de six personnes et plus",
    inclus: [
      "Tout l'Atelier",
      "Travaux à reprogrammer",
      "Opportunités détectées automatiquement",
      "Statistiques d'activité",
      "Notifications à vérifier",
      "Assistance prioritaire",
    ],
  },
];

export function offre(cle: string): Offre | undefined {
  return OFFRES.find((o) => o.cle === cle);
}

export function prix(o: Offre, periodicite: Periodicite): number {
  return periodicite === "annuel" ? o.prixAnnuel : o.prixMensuel;
}

/** Ce que coûte un mois en payant à l'année — sert à montrer l'écart. */
export function equivalentMensuel(o: Offre): number {
  return Math.round(o.prixAnnuel / 12);
}

/**
 * Ce que le garage garde en payant à l'année, en euros.
 *
 * « 2 mois offerts » sur un bouton ne se vérifie pas : le visiteur voit un prix
 * mensuel baisser de 79 à 66 € et n'en déduit pas deux mois. On affiche donc
 * l'écart en clair, et le prix barré à côté du nouveau.
 */
export function economieAnnuelle(o: Offre): number {
  return o.prixMensuel * 12 - o.prixAnnuel;
}

export function formaterEuros(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(montant);
}

// ---------------------------------------------------------------------------
// Comparatif détaillé
// ---------------------------------------------------------------------------
//
// Les trois cartes disent CE QU'ON A ; le comparatif dit CE QUE ÇA CHANGE. Un
// garagiste ne choisit pas entre « ordres de réparation » et « tableau atelier »
// — il choisit entre « je continue à répondre au téléphone toute la journée » et
// « le client voit où en est sa voiture ». Chaque ligne porte donc une phrase
// qui décrit la situation, pas la fonctionnalité.
//
// Même règle que pour `inclus` : rien ici qui ne soit livré en production.

export type LigneComparatif = {
  intitule: string;
  /** Ce que ça change au quotidien, dans les mots du garage. */
  effet: string;
  essentiel: boolean;
  atelier: boolean;
  atelierPlus: boolean;
};

export type GroupeComparatif = { groupe: string; lignes: LigneComparatif[] };

export const COMPARATIF: GroupeComparatif[] = [
  {
    groupe: "Tenir la boutique",
    lignes: [
      {
        intitule: "Agenda et rendez-vous",
        effet: "Vos créneaux au même endroit, plus de double réservation sur un carnet.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Clients et véhicules",
        effet: "L'immatriculation suffit pour retrouver qui c'est et ce qu'on lui a fait.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Dossier véhicule et historique",
        effet: "Tout ce qui a été fait sur la voiture, à montrer au client qui doute.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Devis ligne par ligne",
        effet: "Main-d'œuvre et pièces détaillées, avec les totaux calculés pour vous.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Factures et règlements",
        effet: "La facture reprend l'intervention terminée. Vous voyez ce qui reste à encaisser.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Reprise de votre ancienne base",
        effet: "Vous déposez l'export de votre ancien logiciel, on reconnaît les colonnes.",
        essentiel: true, atelier: true, atelierPlus: true,
      },
    ],
  },
  {
    groupe: "Le client voit, et décide",
    lignes: [
      {
        intitule: "Contrôle véhicule avec photos",
        effet: "Vous consignez l'état constaté en photos. Le client comprend au lieu de vous croire.",
        essentiel: false, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Lien client sans compte à créer",
        effet: "Il reçoit un lien, il ouvre, il répond. Rien à installer, aucun mot de passe.",
        essentiel: false, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Tableau atelier en direct",
        effet: "Où en est chaque voiture, d'un coup d'œil. « Vous en êtes où ? » trouve sa réponse.",
        essentiel: false, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Ordres de réparation",
        effet: "Le devis accepté devient l'ordre de travail, sans le retaper.",
        essentiel: false, atelier: true, atelierPlus: true,
      },
      {
        intitule: "Demandes entrantes centralisées",
        effet: "Les demandes arrivent au même endroit, aucune ne se perd entre deux voitures.",
        essentiel: false, atelier: true, atelierPlus: true,
      },
    ],
  },
  {
    groupe: "Rattraper ce qui dort",
    lignes: [
      {
        intitule: "Travaux à reprogrammer",
        effet: "Le client a refusé les plaquettes en mars ? Vous le savez, et vous le rappelez.",
        essentiel: false, atelier: false, atelierPlus: true,
      },
      {
        intitule: "Opportunités détectées",
        effet: "Devis sans réponse, véhicules jamais revenus : ce qui mérite un appel remonte tout seul.",
        essentiel: false, atelier: false, atelierPlus: true,
      },
      {
        intitule: "Statistiques d'activité",
        effet: "Ce que vous facturez, ce qui traîne, d'où vient le travail.",
        essentiel: false, atelier: false, atelierPlus: true,
      },
      {
        intitule: "Notifications à vérifier",
        effet: "Un message client qui n'est pas parti ne reste pas invisible.",
        essentiel: false, atelier: false, atelierPlus: true,
      },
      {
        intitule: "Assistance prioritaire",
        effet: "Vous nous écrivez, on répond en priorité — pas dans la file commune.",
        essentiel: false, atelier: false, atelierPlus: true,
      },
    ],
  },
];

/** Les lignes du comparatif incluses dans une offre donnée. */
export function lignesIncluses(cle: string): LigneComparatif[] {
  const champ = cle === "essentiel" ? "essentiel" : cle === "atelier" ? "atelier" : "atelierPlus";
  return COMPARATIF.flatMap((g) => g.lignes).filter((l) => l[champ]);
}
