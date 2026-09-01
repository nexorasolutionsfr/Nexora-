// Garage OS — Accueil V1 : fonctions de calcul pures, sans effet de bord.
// Chacune part de données déjà chargées ailleurs dans le tableau de bord —
// aucune ne recalcule la logique métier du Cockpit Opportunités.

const APP_TIME_ZONE = "Europe/Paris";

// Étapes atelier considérant un véhicule comme réellement "engagé" (ni en
// attente de dépôt, ni prêt/restitué) — mêmes clés que WORKSHOP_STAGES dans
// NexoraDashboard.jsx.
const ETAPES_ENGAGEES = ["depose", "diagnostic", "attente_client", "attente_piece", "intervention"];
const ETAPES_ALERTE = ["attente_client", "attente_piece"];

export function saluationHoraire(now = new Date()) {
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now)
  );
  if (heure < 6) return "Bonsoir";
  if (heure < 18) return "Bonjour";
  return "Bonsoir";
}

export function dateLongueFR(now = new Date()) {
  const libelle = new Intl.DateTimeFormat("fr-FR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

export function compterVehiculesEngages(todayAppts = []) {
  return todayAppts.filter((a) => ETAPES_ENGAGEES.includes(a.statut_atelier)).length;
}

export function compterAlertesAtelier(todayAppts = []) {
  return todayAppts.filter((a) => ETAPES_ALERTE.includes(a.statut_atelier)).length;
}
