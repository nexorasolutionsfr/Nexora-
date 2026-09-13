// Garage OS — Atelier : sélecteurs et calculs purs, sans effet de bord.
// Consomme uniquement les rendez-vous déjà chargés par NexoraDashboard
// (aucune requête réseau ici, aucune nouvelle donnée). Les rendez-vous
// passés en entrée portent déjà un `statut` traduit en libellé français
// (ex. "Confirmé") — forme réelle produite par le chargeur existant.
//
// Le regroupement de l'écran, lui, est dans `groupes.js` : les six étapes
// ci-dessous y sont lues comme quatre files de travail. Ce fichier-ci reste
// le vocabulaire des étapes et le calcul de charge ; il ne décide plus de
// l'affichage. Les sélecteurs par étape qu'il portait (`regrouperParEtape`,
// `selectionnerAAccueillir`, `calculerCompteurs`, `determinerAlertes`…) sont
// partis avec les sections qu'ils alimentaient : les garder aurait laissé
// deux découpages concurrents du même écran, et c'est exactement la
// contradiction que ce lot supprime.

const APP_TIME_ZONE = "Europe/Paris";

// Statuts métier qui masquent un rendez-vous partout dans l'atelier, quelle
// que soit son étape atelier — un rendez-vous annulé/absent/terminé ne doit
// jamais réapparaître dans une file de travail.
const STATUTS_EXCLUS = ["Annulé", "Absent", "Terminé"];

// Étapes considérées comme "dans l'atelier" — mêmes clés que WORKSHOP_STAGES
// (NexoraDashboard.jsx), sans "a_venir" (pas encore arrivé) ni "restitue"
// (déjà reparti : la voiture n'est plus l'affaire de l'atelier).
export const ETAPES_ATELIER = [
  { key: "depose", label: "Véhicule déposé" },
  { key: "diagnostic", label: "Diagnostic" },
  { key: "attente_client", label: "En attente client" },
  { key: "attente_piece", label: "Attente pièce" },
  { key: "intervention", label: "En intervention" },
  { key: "pret", label: "Prêt" },
];

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
