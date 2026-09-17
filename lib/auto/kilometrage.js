// Kilométrage d'une voiture : le dernier compteur relevé, et une estimation
// qui ne s'y substitue jamais.
//
// - Le relevé garde sa date et sa source (relevé saisi, ou intervention).
// - L'estimation part du rythme observé entre deux points éloignés d'au moins
//   30 jours ; elle n'est proposée que si le dernier relevé a plus de 14 jours
//   et moins d'un an (au-delà, on ne prolonge pas une tendance : on demande
//   le compteur).
// - Un relevé de plus de 60 jours est « ancien » : l'écran propose de
//   l'actualiser seulement quand le kilométrage sert à une échéance.
// - Des kilométrages qui se contredisent (compteur qui recule, rythme
//   impossible) sont montrés à la personne, jamais corrigés. Tant qu'ils ne
//   sont pas levés, aucune estimation n'est faite et les échéances au compteur
//   sont « à vérifier ».

import { aujourdhuiIso, joursEntre } from "./echeances.js";

export const JOURS_RELEVE_ANCIEN = 60;
export const JOURS_AVANT_ESTIMATION = 14;
export const JOURS_MAX_ESTIMATION = 365;
export const JOURS_MIN_RYTHME = 30;
export const JOURS_MAX_RYTHME = 3 * 365;
// Au-delà, deux compteurs ne peuvent pas appartenir à la même voiture : une
// journée entière sur autoroute fait environ 1 500 km.
export const KM_PAR_JOUR_MAX = 1500;

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

// Chaque kilométrage enregistré, tel quel (pour le montrer et le corriger),
// du plus récent au plus ancien : { cle, date, kilometrage, origine,
// releveId?, historiqueId?, type? }.
export function lignesKilometrage({ releves = [], historique = [] } = {}) {
  const lignes = [
    ...releves
      .filter((r) => dateDe(r?.releve_le) && Number.isFinite(r?.kilometrage))
      .map((r) => ({ cle: `releve:${r.id}`, releveId: r.id, date: dateDe(r.releve_le), kilometrage: r.kilometrage, origine: r.source === "prestation" ? "prestation" : "releve" })),
    ...historique
      .filter((h) => dateDe(h?.realise_le) && Number.isFinite(h?.kilometrage))
      .map((h) => ({ cle: `intervention:${h.id}`, historiqueId: h.id, type: h.type, date: dateDe(h.realise_le), kilometrage: h.kilometrage, origine: "intervention" })),
  ];
  return lignes.sort((a, b) => (a.date === b.date ? b.kilometrage - a.kilometrage : a.date < b.date ? 1 : -1));
}

// Paires de kilométrages qui se contredisent, en comparant chaque ligne à la
// précédente dans le temps : { avant, apres, motif: "recul" | "rythme" |
// "meme_jour" }. Deux lignes du même jour ne se contredisent que si l'écart
// dépasse une journée de route.
export function incoherencesDuKilometrage({ releves = [], historique = [] } = {}) {
  const chronologie = lignesKilometrage({ releves, historique }).reverse();
  const incoherences = [];
  for (let i = 1; i < chronologie.length; i += 1) {
    const avant = chronologie[i - 1];
    const apres = chronologie[i];
    const jours = Math.max(1, joursEntre(avant.date, apres.date));
    if (avant.date === apres.date) {
      if (Math.abs(apres.kilometrage - avant.kilometrage) > KM_PAR_JOUR_MAX) incoherences.push({ avant, apres, motif: "meme_jour" });
    } else if (apres.kilometrage < avant.kilometrage) {
      incoherences.push({ avant, apres, motif: "recul" });
    } else if ((apres.kilometrage - avant.kilometrage) / jours > KM_PAR_JOUR_MAX) {
      incoherences.push({ avant, apres, motif: "rythme" });
    }
  }
  return incoherences;
}

// Retour :
// - { etat: "inconnu" }
// - { etat: "releve", dernier: { date, kilometrage, origine }, joursDepuis, ancien,
//     parJour?, estimation?: { kilometrage, auJour },
//     aVerifier?: true, incoherences? }   — aVerifier : ni rythme ni estimation
export function estimerKilometrage({ releves = [], historique = [], aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const points = pointsKilometrage({ releves, historique });
  const dernier = points.at(-1);
  if (!dernier) return { etat: "inconnu" };

  const joursDepuis = Math.max(0, joursEntre(dernier.date, jour));
  const resultat = { etat: "releve", dernier, joursDepuis, ancien: joursDepuis > JOURS_RELEVE_ANCIEN };

  const incoherences = incoherencesDuKilometrage({ releves, historique });
  if (incoherences.length) return { ...resultat, aVerifier: true, incoherences };

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
