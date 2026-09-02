// Libellés du Dossier Véhicule 360 — dérivés des mêmes états métier déjà
// utilisés ailleurs dans le dashboard (rendez-vous, devis, factures,
// étapes atelier). Aucun nouvel état métier n'est inventé ici : ce fichier
// ne fait qu'habiller les clés produites par ./calculs.js.

export const STATUT_GLOBAL_LABEL = {
  devis_en_attente: "Devis en attente",
  rdv_a_venir: "Rendez-vous à venir",
  facture_en_attente: "Facture en attente",
  a_jour: "Dossier à jour",
  aucun_suivi: "Aucun suivi en cours",
};

export const STATUT_GLOBAL_TONE = {
  devis_en_attente: "amber",
  rdv_a_venir: "green",
  facture_en_attente: "red",
  a_jour: "slate",
  aucun_suivi: "slate",
};

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
