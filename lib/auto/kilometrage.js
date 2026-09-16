// Kilométrage d'une voiture : le dernier compteur relevé, et une estimation
// qui ne s'y substitue jamais.
//
// - Le relevé garde sa date et sa source (relevé saisi, ou intervention).
// - L'estimation part du rythme observé entre deux points éloignés d'au moins
//   30 jours ; elle n'est proposée que si le dernier relevé a plus de 14 jours
//   et moins d'un an (au-delà, on ne prolonge pas une tendance : on demande
//   le compteur).
// - Un relevé de plus de 60 jours est « ancien » : l'écran propose de
//   l'actualiser quand le kilométrage sert à une échéance.

import { aujourdhuiIso, joursEntre } from "./echeances.js";

export const JOURS_RELEVE_ANCIEN = 60;
export const JOURS_AVANT_ESTIMATION = 14;
export const JOURS_MAX_ESTIMATION = 365;
export const JOURS_MIN_RYTHME = 30;
export const JOURS_MAX_RYTHME = 3 * 365;

const dateDe = (valeur) => (typeof valeur === "string" && /^\d{4}-\d{2}-\d{2}/.test(valeur) ? valeur.slice(0, 10) : null);

// Tous les points connus, du plus ancien au plus récent ; à date égale, le
// compteur le plus haut.
export function pointsKilometrage({ releves = [], historique = [] } = {}) {
  const parDate = new Map();
  const ajouter = (date, kilometrage, origine) => {
    if (!date || !Number.isFinite(kilometrage)) return;
    const existant = parDate.get(date);
    if (!existant || kilometrage > existant.kilometrage) parDate.set(date, { date, kilometrage, origine });
  };
  for (const r of releves) ajouter(dateDe(r?.releve_le), r?.kilometrage, r?.source === "prestation" ? "prestation" : "releve");
  for (const h of historique) ajouter(dateDe(h?.realise_le), h?.kilometrage, "intervention");
  return [...parDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Retour :
// - { etat: "inconnu" }
// - { etat: "releve", dernier: { date, kilometrage, origine }, joursDepuis, ancien,
//     parJour?, estimation?: { kilometrage, auJour } }
export function estimerKilometrage({ releves = [], historique = [], aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const points = pointsKilometrage({ releves, historique });
  const dernier = points.at(-1);
  if (!dernier) return { etat: "inconnu" };

  const joursDepuis = Math.max(0, joursEntre(dernier.date, jour));
  const resultat = { etat: "releve", dernier, joursDepuis, ancien: joursDepuis > JOURS_RELEVE_ANCIEN };

  const premier = points.find((p) => {
    const ecart = joursEntre(p.date, dernier.date);
    return ecart >= JOURS_MIN_RYTHME && ecart <= JOURS_MAX_RYTHME;
  });
  if (!premier) return resultat;
  const parcourus = dernier.kilometrage - premier.kilometrage;
  if (parcourus <= 0) return resultat;
  resultat.parJour = parcourus / joursEntre(premier.date, dernier.date);

  if (joursDepuis >= JOURS_AVANT_ESTIMATION && joursDepuis <= JOURS_MAX_ESTIMATION) {
    resultat.estimation = {
      kilometrage: Math.round((dernier.kilometrage + resultat.parJour * joursDepuis) / 100) * 100,
      auJour: jour,
    };
  }
  return resultat;
}
