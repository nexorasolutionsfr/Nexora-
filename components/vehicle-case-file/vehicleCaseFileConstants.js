// Libellés du Dossier Véhicule 360 — dérivés des mêmes états métier déjà
// utilisés ailleurs dans le dashboard (rendez-vous, devis, factures,
// étapes atelier). Aucun nouvel état métier n'est inventé ici : ce fichier
// ne fait qu'habiller les clés produites par ./calculs.js.

// Le « statut global » du dossier a été retiré le 13 septembre 2026 : il
// fusionnait atelier, devis et facture en une seule clé, et il était calculé
// sans l'ordre de réparation. L'état vient désormais de `atelier/filVehicule`,
// et les statuts métier restent affichés séparément — d'où les libellés
// ci-dessous, qui eux sont conservés.

export const DEVIS_STATUT_LABEL = {
  en_attente: "En attente",
  accepte: "Accepté",
  refuse: "Refusé",
};

export const DEVIS_STATUT_TONE = {
  en_attente: "amber",
  accepte: "green",
  refuse: "red",
};

export const FACTURE_STATUT_LABEL = {
  en_attente: "En attente de paiement",
  payee: "Payée",
};

export const FACTURE_STATUT_TONE = {
  en_attente: "amber",
  payee: "green",
};

export const EVENEMENT_TYPE_LABEL = {
  rendez_vous: "Rendez-vous",
  devis: "Devis",
  facture: "Facture",
};
