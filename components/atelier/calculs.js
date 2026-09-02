// Garage OS — Atelier V1 : sélecteurs et calculs purs, sans effet de bord.
// Consomme uniquement les rendez-vous déjà chargés par NexoraDashboard
// (aucune requête réseau ici, aucune nouvelle donnée). Les rendez-vous
// passés en entrée portent déjà un `statut` traduit en libellé français
// (ex. "Confirmé") — forme réelle produite par le chargeur existant.

const APP_TIME_ZONE = "Europe/Paris";

// Statuts métier qui masquent un rendez-vous partout dans l'atelier, quelle
// que soit son étape atelier — un rendez-vous annulé/absent/terminé ne doit
// jamais réapparaître dans une file de travail.
const STATUTS_EXCLUS = ["Annulé", "Absent", "Terminé"];

// Étapes considérées comme "dans l'atelier" — mêmes clés que WORKSHOP_STAGES
// (NexoraDashboard.jsx), sans "a_venir" (pas encore arrivé) ni "restitue"
// (déjà reparti, traité séparément par selectionnerRestitutionsAujourdhui).
// "pret" reste compté dans cet ensemble (le compteur "Dans l'atelier" inclut
// les véhicules prêts) mais n'a pas sa propre colonne dans la grille — voir
// ETAPES_GRILLE_ATELIER ci-dessous, seule utilisée par regrouperParEtape,
// pour ne jamais afficher un même rendez-vous à la fois dans la grille et
// dans la section dédiée "Prêts à restituer".
export const ETAPES_ATELIER = [
  { key: "depose", label: "Véhicule déposé" },
  { key: "diagnostic", label: "Diagnostic" },
  { key: "attente_client", label: "En attente client" },
  { key: "attente_piece", label: "Attente pièce" },
  { key: "intervention", label: "En intervention" },
  { key: "pret", label: "Prêt" },
];
const CLES_ETAPES_ATELIER = ETAPES_ATELIER.map((etape) => etape.key);

// Colonnes réellement affichées dans la grille "Dans l'atelier" — "pret" en
// est exclu pour éviter le doublon visuel avec "Prêts à restituer" (même
// rendez-vous montré deux fois dans la vue, constaté en recette).
const ETAPES_GRILLE_ATELIER = ETAPES_ATELIER.filter((etape) => etape.key !== "pret");

// Étapes activement suivies (exclut "pret" : un véhicule prêt n'est ni en
// retard ni orphelin, il attend simplement d'être restitué) — c'est sur ce
// sous-ensemble que portent les alertes "non assigné" et "heure dépassée".
const ETAPES_EN_COURS = ["depose", "diagnostic", "attente_client", "attente_piece", "intervention"];

function dateKeyParis(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function estAujourdhui(valeur, maintenant = new Date()) {
  const cle = dateKeyParis(valeur);
  return cle !== null && cle === dateKeyParis(maintenant);
}

export function estRendezVousExclu(rdv) {
  return STATUTS_EXCLUS.includes(rdv?.statut);
}

// "À accueillir aujourd'hui" — rendez-vous du jour sans étape atelier
// engagée (absente ou explicitement "a_venir"). La date du jour prime
// toujours : un rendez-vous ancien resté sans statut_atelier n'est jamais
// réintroduit ici.
export function selectionnerAAccueillir(rendezVous = [], maintenant = new Date()) {
  return rendezVous.filter((r) => {
    if (estRendezVousExclu(r)) return false;
    const etape = r.statut_atelier || "a_venir";
    if (etape !== "a_venir") return false;
    return estAujourdhui(r.date_debut, maintenant);
  });
}

// "Dans l'atelier" — les 6 étapes engagées, quelle que soit la date
// d'entrée : un véhicule en intervention depuis hier reste visible.
export function selectionnerDansAtelier(rendezVous = []) {
  return rendezVous.filter((r) => !estRendezVousExclu(r) && CLES_ETAPES_ATELIER.includes(r.statut_atelier));
}

// Répartition "Dans l'atelier" par étape, pour le tableau/kanban. N'inclut
// jamais "pret" : ces rendez-vous n'apparaissent que dans la section dédiée
// "Prêts à restituer" (selectionnerPretsARestituer), jamais dans les deux à
// la fois.
export function regrouperParEtape(rendezVous = []) {
  const dansAtelier = selectionnerDansAtelier(rendezVous);
  return ETAPES_GRILLE_ATELIER.map((etape) => ({
    ...etape,
    rendezVous: dansAtelier.filter((r) => r.statut_atelier === etape.key),
  }));
}

// "Prêts à restituer" — étape "pret", quelle que soit la date d'entrée : un
// véhicule prêt depuis la veille reste visible tant qu'il n'est pas
// "restitue".
export function selectionnerPretsARestituer(rendezVous = []) {
  return rendezVous.filter((r) => !estRendezVousExclu(r) && r.statut_atelier === "pret");
}

// "Restitutions prévues aujourd'hui" — aucun horodatage de transition
// n'existe en base pour "restitue" : on se rabat sur la date du rendez-vous
// lui-même (jamais présentée comme une heure de restitution réelle, voir
// le libellé choisi côté vue).
export function selectionnerRestitutionsAujourdhui(rendezVous = [], maintenant = new Date()) {
  return rendezVous.filter(
    (r) => !estRendezVousExclu(r) && r.statut_atelier === "restitue" && estAujourdhui(r.date_debut, maintenant)
  );
}

export function calculerCompteurs(rendezVous = [], maintenant = new Date()) {
  const dansAtelier = selectionnerDansAtelier(rendezVous);
  return {
    aAccueillir: selectionnerAAccueillir(rendezVous, maintenant).length,
    dansAtelier: dansAtelier.length,
    bloques: dansAtelier.filter((r) => r.statut_atelier === "attente_client" || r.statut_atelier === "attente_piece").length,
    prets: dansAtelier.filter((r) => r.statut_atelier === "pret").length,
  };
}

// Alertes factuelles — jamais de durée chiffrée ni de retard estimé,
// seulement des constats binaires dérivés des données déjà chargées.
export function determinerAlertes(rdv, maintenant = new Date()) {
  const alertes = [];
  if (!rdv || estRendezVousExclu(rdv)) return alertes;
  if (rdv.statut_atelier === "attente_client") alertes.push("Attente client");
  if (rdv.statut_atelier === "attente_piece") alertes.push("Attente pièce");
  if (ETAPES_EN_COURS.includes(rdv.statut_atelier)) {
    const fin = rdv.date_fin ? new Date(rdv.date_fin) : null;
    if (fin && !Number.isNaN(fin.getTime()) && fin.getTime() < maintenant.getTime()) {
      alertes.push("Heure prévue dépassée");
    }
    if (!rdv.mecanicien_id) alertes.push("Non assigné");
  }
  return alertes;
}

// "Temps planifié aujourd'hui" par mécanicien — nombre de rendez-vous et
// somme des créneaux (date_fin − date_debut) en minutes, jamais de
// pourcentage de capacité ni de productivité. Un créneau dont la date est
// invalide ou incohérente (fin ≤ début) n'est simplement pas comptabilisé
// dans la somme ; un rendez-vous dont la date de début elle-même est
// invalide est exclu du calcul (impossible de savoir s'il est du jour).
export function calculerTempsPlanifieParMecanicien(rendezVous = [], mecaniciens = [], maintenant = new Date()) {
  const parId = new Map();
  for (const m of mecaniciens) {
    parId.set(m.id, { mecanicienId: m.id, nom: m.nom, nombreRdv: 0, minutesPlanifiees: 0 });
  }
  const nonAssigne = { mecanicienId: null, nom: "Non assigné", nombreRdv: 0, minutesPlanifiees: 0 };

  for (const r of rendezVous) {
    if (estRendezVousExclu(r)) continue;
    if (!estAujourdhui(r.date_debut, maintenant)) continue;

    const cible = r.mecanicien_id && parId.has(r.mecanicien_id) ? parId.get(r.mecanicien_id) : nonAssigne;
    cible.nombreRdv += 1;

    const debut = new Date(r.date_debut);
    const fin = r.date_fin ? new Date(r.date_fin) : null;
    const dureeValide = fin && !Number.isNaN(debut.getTime()) && !Number.isNaN(fin.getTime()) && fin.getTime() > debut.getTime();
    if (dureeValide) cible.minutesPlanifiees += Math.round((fin.getTime() - debut.getTime()) / 60000);
  }

  const resultat = [...parId.values()];
  if (nonAssigne.nombreRdv > 0) resultat.push(nonAssigne);
  return resultat;
}
