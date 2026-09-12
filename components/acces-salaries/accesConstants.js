// Accès salariés V1 — vocabulaire partagé et carte des vues par rôle.
//
// Ce module ne protège rien. Les droits réels sont appliqués en base, par
// les policies et les fonctions security definer des migrations
// 20260905000100 à 20260905000700 : un mécanicien qui contournerait
// l'interface n'obtiendrait toujours aucune ligne. Ce qui suit sert
// uniquement à ne pas afficher des écrans qui reviendraient vides, et à
// nommer les rôles au même endroit côté client et côté base.

export const ROLE_DIRIGEANT = "dirigeant";
export const ROLE_ACCUEIL = "accueil";
export const ROLE_MECANICIEN = "mecanicien";

export const ROLES = [ROLE_DIRIGEANT, ROLE_ACCUEIL, ROLE_MECANICIEN];

export const LIBELLES_ROLES = {
  [ROLE_DIRIGEANT]: "Dirigeant",
  [ROLE_ACCUEIL]: "Accueil",
  [ROLE_MECANICIEN]: "Mécanicien",
};

export const DESCRIPTIONS_ROLES = {
  [ROLE_DIRIGEANT]:
    "Contrôle complet : clients, atelier, facturation, statistiques, réglages et gestion des accès.",
  [ROLE_ACCUEIL]:
    "Clients, véhicules, rendez-vous, devis, factures, contrôle véhicule et suivi d'atelier. Ni statistiques, ni réglages, ni gestion des accès.",
  [ROLE_MECANICIEN]:
    "Uniquement les ordres de réparation qui lui sont affectés, leurs étapes et ses constats techniques. Aucun prix, aucune coordonnée client.",
};

// Vues du dashboard ouvertes à chaque rôle. Le dirigeant n'est pas listé :
// il a tout, y compris les vues ajoutées plus tard, et une liste blanche
// l'aurait silencieusement privé de toute nouveauté.
const VUES_ACCUEIL = [
  "accueil",
  "agenda",
  "demandes",
  "clients",
  "vehicules",
  "devis",
  // Décision produit du 12 septembre 2026 : l'accueil tient le comptoir, donc
  // il encaisse et transmet les factures. Les policies `factures_accueil_*`
  // (20260916000200) ouvrent la table en lecture, création et modification —
  // sans suppression, et sans rien d'autre. L'historique des devis,
  // les statistiques, les réglages et les accès restent au dirigeant.
  "factures",
  "verifier",
  "inspections",
  "atelier",
  "ordres_reparation",
  "liste_attente",
];

const VUES_MECANICIEN = ["atelier_mecanicien"];

export function vuesAutorisees(role) {
  if (role === ROLE_DIRIGEANT) return null; // null = aucune restriction
  if (role === ROLE_ACCUEIL) return VUES_ACCUEIL;
  if (role === ROLE_MECANICIEN) return VUES_MECANICIEN;
  return [];
}

export function peutVoir(role, vue) {
  const autorisees = vuesAutorisees(role);
  if (autorisees === null) return true;
  return autorisees.includes(vue);
}

export function peutGererLesAcces(role) {
  return role === ROLE_DIRIGEANT;
}

// Établir une facture, l'encaisser, préparer son envoi. Les mêmes contrôles
// s'appliquent en base pour les deux rôles — `a_acces_garage(garage_id,
// 'dirigeant', 'accueil')` sur les fonctions d'envoi, policies dédiées sur la
// table. Ce prédicat-ci ne sert qu'à ne pas afficher ce qui reviendrait vide.
export function peutFacturer(role) {
  return role === ROLE_DIRIGEANT || role === ROLE_ACCUEIL;
}

export function estRoleConnu(role) {
  return ROLES.includes(role);
}
