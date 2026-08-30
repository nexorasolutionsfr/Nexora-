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

// Seuils réglables — chacun repris tel quel d'une règle déjà en place
// ailleurs dans le dashboard (voir deriveOpportunites.js pour la référence
// exacte). Aucun seuil temporel n'est inventé pour les inspections ou les
// confirmations RDV : leur section est fixe (voir SECTION_FIXE ci-dessous).
export const SEUILS = {
  propositionRetard: { maintenantJours: 1 }, // AujourdhuiView, propositionsEnRetard
  travailDiffereRetardCritique: { jours: 14 }, // AujourdhuiView, retardJours >= 14
  demandeNonUrgente: { basculeHeures: 4 }, // AujourdhuiView, demandesEnRisque — au-delà : toujours "aujourd'hui"
};

// Section fixe pour les catégories sans règle temporelle préexistante à
// reprendre : inspection en attente (toujours "aujourd'hui") et RDV sans
// confirmation (report_demande -> "maintenant", en_attente_confirmation ->
// "aujourd'hui"), sans aucun filtre de date ni palier.
export const SECTION_FIXE = {
  inspectionEnAttente: "aujourdhui",
  rdvReportDemande: "maintenant",
  rdvEnAttenteConfirmation: "aujourdhui",
};

// Sources pour lesquelles une réapparition automatique après traitement est
// possible, parce qu'un champ updated_at fiable et déjà utilisé ailleurs
// dans l'app existe pour elles. Liste fermée et explicite : pour toute autre
// source (demande, proposition, devis, rdv_confirmation, client_dormant),
// aucun champ de ce type n'a été vérifié fiable — elles restent masquées
// jusqu'à réactivation manuelle ou échéance du report, sans mécanisme inventé.
export const SOURCES_REACTIVATION_AUTO = ["rappel", "inspection", "travail_differe"];

// Sources dont l'action principale reste un contrôle de suivi interne
// (changement de statut / reprogrammation) au lieu d'une simple ouverture de
// dossier, faute de dossier dédié existant pour l'instant.
export const SOURCES_SUIVI_INTERNE = ["rappel", "travail_differe"];

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
