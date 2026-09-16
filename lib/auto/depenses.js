// Dépenses d'une voiture, calculées à partir des montants enregistrés dans son
// historique. Rien n'est estimé : une intervention sans montant ne compte pas,
// et on dit combien il y en a.
//
// Les montants sont additionnés en centimes pour qu'aucune virgule flottante
// ne décale un total.

import { ajouterMois, aujourdhuiIso } from "./echeances.js";

function enCentimes(montant) {
  const n = typeof montant === "string" ? Number(montant) : montant;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// Retour :
// { totalCentimes, douzeMoisCentimes, nombreAvecMontant, nombreSansMontant,
//   parAnnee: [{ annee, totalCentimes, nombre }]   (plus récente d'abord),
//   parType:  [{ type, totalCentimes, nombre }]    (plus coûteux d'abord),
//   depuis: date de la plus ancienne dépense ou null }
export function resumerDepenses(historique = [], { aujourdhui } = {}) {
  const jour = aujourdhui ?? aujourdhuiIso();
  const debutDouzeMois = ajouterMois(jour, -12);
  const annees = new Map();
  const types = new Map();
  let totalCentimes = 0;
  let douzeMoisCentimes = 0;
  let nombreAvecMontant = 0;
  let nombreSansMontant = 0;
  let depuis = null;

  for (const ligne of historique) {
    const date = typeof ligne?.realise_le === "string" ? ligne.realise_le.slice(0, 10) : null;
    const centimes = enCentimes(ligne?.montant_ttc);
    if (!date || centimes === null || ligne?.montant_ttc === null || ligne?.montant_ttc === undefined || ligne?.montant_ttc === "") {
      nombreSansMontant += 1;
      continue;
    }
    nombreAvecMontant += 1;
    totalCentimes += centimes;
    if (date > debutDouzeMois && date <= jour) douzeMoisCentimes += centimes;
    if (!depuis || date < depuis) depuis = date;

    const annee = Number(date.slice(0, 4));
    const parAnnee = annees.get(annee) ?? { annee, totalCentimes: 0, nombre: 0 };
    parAnnee.totalCentimes += centimes;
    parAnnee.nombre += 1;
    annees.set(annee, parAnnee);

    const parType = types.get(ligne.type) ?? { type: ligne.type, totalCentimes: 0, nombre: 0 };
    parType.totalCentimes += centimes;
    parType.nombre += 1;
    types.set(ligne.type, parType);
  }

  return {
    totalCentimes,
    douzeMoisCentimes,
    nombreAvecMontant,
    nombreSansMontant,
    parAnnee: [...annees.values()].sort((a, b) => b.annee - a.annee),
    parType: [...types.values()].sort((a, b) => b.totalCentimes - a.totalCentimes || a.type.localeCompare(b.type)),
    depuis,
  };
}
