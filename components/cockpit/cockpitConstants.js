// Cockpit Opportunités V1 — règles de priorité.
// Aucun score, aucune probabilité : chaque seuil ci-dessous est une règle
// métier simple, visible et modifiable directement ici. La section d'une
// opportunité (maintenant / aujourd'hui / a_planifier) est déterminée par
// ces seuils, jamais par un calcul opaque.

export const SECTIONS = ["maintenant", "aujourdhui", "a_planifier"];

export const SECTION_LABEL = {
  maintenant: "Maintenant",
  aujourdhui: "Aujourd'hui",
  a_planifier: "À planifier",
};

export const SECTION_SUBTITLE = {
  maintenant: "Ça ne doit pas attendre",
  aujourdhui: "À traiter dans la journée",
  a_planifier: "Pas urgent, à garder à l'œil",
};

export const SECTION_TONE = {
  maintenant: { bg: "#FDECEC", text: "#B91C1C", stripe: "#DC2626" },
  aujourdhui: { bg: "#EAF0FF", text: "#2748A6", stripe: "#3D6BE0" },
  a_planifier: { bg: "#F1F5F9", text: "#475569", stripe: "#94A3B8" },
};

// Seuils réglables — durées en heures/jours utilisées par deriveOpportunites.js
export const SEUILS = {
  rdvConfirmation: { maintenantJours: 1, aujourdhuiJours: 3, horizonMaxJours: 14 },
  inspectionEnAttente: { maintenantHeures: 48, aujourdhuiHeures: 4 },
  propositionRetard: { maintenantJours: 1 },
  travailDiffereRetardCritique: { jours: 14 },
  demandeNonUrgente: { basculeHeures: 4 }, // au-delà : toujours "aujourd'hui", jamais reporté à plus tard
};

export const ORIGINE_LABEL = {
  rappel: "Relais Appels",
  demande: "Demande Gmail",
  proposition: "Créneau proposé",
  devis: "Devis",
  rdv_confirmation: "Confirmation RDV",
  inspection: "Inspection véhicule",
  travail_differe: "Travail différé",
  client_dormant: "Client fidèle",
};
