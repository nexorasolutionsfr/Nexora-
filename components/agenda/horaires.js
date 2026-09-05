// Les heures que l'agenda doit afficher pour un jour donné.
//
// LE PROBLÈME QUE CE MODULE RÈGLE
//
// La grille du jour était une constante : 08:00 à 17:00, tous les jours, quels
// que soient les horaires du garage. Un samedi où l'accueil annonce « Fermé
// aujourd'hui », l'agenda proposait quand même dix créneaux « disponibles »
// avec un « + Ajouter ». Les deux écrans se contredisaient, et celui qui a
// tort est celui qui invite à prendre un rendez-vous.
//
// LA RÈGLE QU'ON NE VIOLE JAMAIS
//
// Un rendez-vous déjà pris est visible, même hors des heures d'ouverture. Un
// garage dépanne le samedi, ouvre plus tôt pour un client pressé, garde une
// voiture après la fermeture. Masquer une heure parce qu'elle est hors plage
// ferait DISPARAÎTRE un rendez-vous de l'agenda — un bien pire défaut que
// celui qu'on corrige. Les heures occupées sont donc toujours ajoutées.

/** Grille de repli, celle d'avant : utilisée quand le garage n'a pas d'horaires. */
export const HEURES_DEFAUT = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

/** Les horaires sont indexés "1" = lundi … "7" = dimanche, comme en base. */
export function clefJour(date) {
  const jour = date.getDay(); // 0 = dimanche
  return String(jour === 0 ? 7 : jour);
}

/** Les plages d'ouverture d'un jour, ou [] si le garage est fermé ce jour-là. */
export function plagesDuJour(horaires, date) {
  if (!horaires || typeof horaires !== "object") return null; // horaires inconnus
  const plages = horaires[clefJour(date)];
  if (!Array.isArray(plages)) return [];
  return plages.filter(
    (p) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string" && p[0] < p[1],
  );
}

/**
 * `true` seulement si on SAIT que le garage est fermé. Des horaires absents
 * ne sont pas une fermeture : c'est une ignorance, et on n'annonce pas une
 * fermeture qu'on n'a pas constatée.
 */
export function estFerme(horaires, date) {
  const plages = plagesDuJour(horaires, date);
  return plages !== null && plages.length === 0;
}

function heure(valeur) {
  return `${String(valeur).padStart(2, "0")}:00`;
}

/**
 * Les heures à afficher dans la grille du jour.
 *
 * @param {object|null} horaires        garages.horaires
 * @param {Date}        date            le jour affiché
 * @param {string[]}    heuresOccupees  heures ayant déjà un rendez-vous ("HH:MM")
 */
export function heuresOuvrables(horaires, date, heuresOccupees = []) {
  const occupees = heuresOccupees
    .filter((h) => typeof h === "string" && h.length >= 2)
    .map((h) => heure(h.slice(0, 2)));

  const plages = plagesDuJour(horaires, date);
  if (plages === null) {
    // Horaires inconnus : on ne retire rien, on garde la grille d'avant.
    return [...new Set([...HEURES_DEFAUT, ...occupees])].sort();
  }

  const ouvertes = new Set();
  for (const [debut, fin] of plages) {
    const premiere = Number(debut.slice(0, 2));
    // Une fermeture à 12:30 laisse l'heure de 12:00 ouverte ; une fermeture à
    // 12:00 pile ne la laisse pas. D'où le test sur les minutes.
    const finHeure = Number(fin.slice(0, 2));
    const finMinutes = Number(fin.slice(3, 5) || 0);
    const derniere = finMinutes > 0 ? finHeure : finHeure - 1;
    for (let h = premiere; h <= derniere; h += 1) ouvertes.add(heure(h));
  }
  for (const h of occupees) ouvertes.add(h);
  return [...ouvertes].sort();
}

/**
 * Une heure est-elle réservable ? Hors plage, on affiche le rendez-vous qui
 * s'y trouve mais on n'invite pas à en créer un nouveau : proposer un créneau
 * un jour de fermeture est précisément le défaut d'origine.
 *
 * C'est un test de CHEVAUCHEMENT, pas d'appartenance. Un garage qui ouvre à
 * 08:30 a une demi-heure à vendre dans la tranche de 08:00 ; comparer 08:00 au
 * début de la plage la déclarait « hors ouverture » et lui faisait perdre ce
 * créneau. Défaut constaté sur des horaires réels — les demi-heures sont la
 * règle, pas l'exception.
 */
export function heureReservable(horaires, date, h) {
  const plages = plagesDuJour(horaires, date);
  if (plages === null) return true;
  if (plages.length === 0) return false;
  const finTranche = heure(Number(h.slice(0, 2)) + 1);
  return plages.some(([debut, fin]) => debut < finTranche && h < fin);
}
