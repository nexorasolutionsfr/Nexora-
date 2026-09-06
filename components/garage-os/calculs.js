// Garage OS — Accueil V1 : fonctions de calcul pures, sans effet de bord.
// Chacune part de données déjà chargées ailleurs dans le tableau de bord —
// aucune ne recalcule la logique métier du Cockpit Opportunités.

const APP_TIME_ZONE = "Europe/Paris";

// Étapes atelier considérant un véhicule comme réellement "engagé" (ni en
// attente de dépôt, ni prêt/restitué) — mêmes clés que WORKSHOP_STAGES dans
// NexoraDashboard.jsx. Un véhicule engagé le reste indépendamment de la date
// initiale de son rendez-vous : un diagnostic commencé hier et toujours en
// intervention aujourd'hui doit continuer à compter.
const ETAPES_ENGAGEES = ["depose", "diagnostic", "attente_client", "attente_piece", "intervention"];
const ETAPES_ALERTE = ["attente_client", "attente_piece"];
// Étapes dont le décompte reste volontairement limité aux rendez-vous du
// jour : "à venir" n'a de sens que pour aujourd'hui, et pret/restitue
// suivent la même fenêtre que le reste de l'aperçu "Votre journée".
const ETAPES_LIMITEES_AUJOURDHUI = ["a_venir", "pret", "restitue"];

export function saluationHoraire(now = new Date()) {
  // `format()` d'une heure SEULE en fr-FR rend « 11 h », pas « 11 » : le
  // Number() qui lisait cette chaine valait donc NaN, et comme toute
  // comparaison avec NaN est fausse, la fonction retombait sur « Bonsoir » à
  // n'importe quelle heure du jour. On lit la partie `hour` plutot que la
  // chaine formatée, qui est destinée à l'affichage et dépend de la langue.
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value
  );
  if (!Number.isFinite(heure)) return "Bonjour";
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

// Sélection centrale des véhicules réellement engagés en atelier — parmi
// TOUS les rendez-vous chargés, indépendamment de la date initiale du
// rendez-vous. Base commune au compteur de synthèse et à l'aperçu
// "Progression atelier" pour qu'aucune règle ne diverge entre les deux.
export function selectionnerVehiculesEngages(rendezVous = []) {
  return rendezVous.filter((r) => ETAPES_ENGAGEES.includes(r.statut_atelier));
}

export function compterVehiculesEngages(rendezVous = []) {
  return selectionnerVehiculesEngages(rendezVous).length;
}

export function compterAlertesAtelier(rendezVous = []) {
  return selectionnerVehiculesEngages(rendezVous).filter((r) => ETAPES_ALERTE.includes(r.statut_atelier)).length;
}

// Décompte par étape pour l'aperçu "Progression atelier" : les étapes
// actives comptent sur l'ensemble des rendez-vous chargés (un véhicule
// entré hier et toujours en intervention doit apparaître) ; "à venir",
// "prêt" et "restitué" restent limités aux rendez-vous du jour. Chaque
// rendez-vous n'a qu'un seul statut_atelier à la fois : les deux groupes
// d'étapes sont disjoints, donc aucune ligne n'est comptée deux fois.
export function calculerProgressionAtelier(rendezVous = [], todayAppts = []) {
  const compteurs = {};
  for (const etape of ETAPES_ENGAGEES) {
    compteurs[etape] = rendezVous.filter((r) => r.statut_atelier === etape).length;
  }
  for (const etape of ETAPES_LIMITEES_AUJOURDHUI) {
    compteurs[etape] = todayAppts.filter((a) => (a.statut_atelier || "a_venir") === etape).length;
  }
  return compteurs;
}
