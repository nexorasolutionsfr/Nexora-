// Ordre de Réparation V1 — constantes partagées entre les composants de ce
// dossier. Reprend les jetons visuels de garage-os/tokens.js (mêmes valeurs
// que components/NexoraDashboard.jsx) pour rester cohérent avec le reste du
// produit. Portée strictement V1 : voir docs/architecture/ordre-reparation-v1.md.

export const STATUT_OR_LABEL = {
  brouillon: "Brouillon",
  confirme: "Confirmé",
  termine: "Terminé",
  annule: "Annulé",
};

export const STATUT_OR_TONE = {
  brouillon: "slate",
  confirme: "amber",
  termine: "green",
  annule: "red",
};

// Ordre proposé dans le sélecteur de statut — l'annulation n'y figure pas :
// elle passe par une action dédiée avec confirmation (voir OrdresReparationSection).
export const STATUTS_OR_MODIFIABLES = ["brouillon", "confirme", "termine"];

export const TYPE_LIGNE_LABEL = {
  main_oeuvre: "Main d'œuvre",
  piece: "Pièce",
};

export const ACTION_HISTORIQUE_LABEL = {
  creation: "Création de l'ordre",
  changement_statut: "Changement de statut",
  changement_mecanicien: "Changement de mécanicien",
  annulation: "Annulation",
};
