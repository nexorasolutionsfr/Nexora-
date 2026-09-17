// Corriger une intervention déjà enregistrée : saisie manuelle ou confirmée
// d'après une facture.
//
// Règles :
// - La provenance ne change pas : une intervention « d'après votre facture »
//   le reste, sa facture reste jointe. La correction est celle de la personne.
// - Une facture = une intervention et un montant total : corriger les
//   opérations ne multiplie jamais la dépense ; le détail affiché suit les
//   opérations.
// - Rien n'est recalculé en base : dépenses, kilométrage et « À prévoir » se
//   déduisent de l'historique à chaque affichage, donc suivent la correction.
// - Une ressemblance avec une autre intervention, une incohérence de
//   kilométrage : signalées, jamais bloquantes, rien n'est fusionné.
//
// Pur et testé (corrections.test.js).

import { incoherencesKilometrage, interventionsRessemblantes, libelleOperations } from "./factures.js";

const texte = (v) => (v == null ? "" : String(v));

// Ligne de auto_historique → saisie du formulaire (des chaînes).
export function saisieDepuisIntervention(ligne) {
  return {
    type: texte(ligne.type),
    realiseLe: texte(ligne.realise_le).slice(0, 10),
    kilometrage: ligne.kilometrage == null ? "" : String(ligne.kilometrage),
    prestataire: texte(ligne.prestataire),
    montant: ligne.montant_ttc == null ? "" : String(Number(ligne.montant_ttc).toFixed(2)).replace(".", ","),
    libelle: texte(ligne.libelle),
    resultatControle: texte(ligne.resultat_controle),
    natureControle: ligne.nature_controle ?? "periodique",
    controleValableJusquAu: texte(ligne.controle_valable_jusqu_au).slice(0, 10),
    operations: Array.isArray(ligne.operations) ? ligne.operations.map((o) => ({ type: o.type, libelle: o.libelle })) : [],
  };
}

// Les opérations se modifient pour une intervention qui en a, ou qui vient
// d'une facture.
export function avecOperations(ligne) {
  return ligne?.saisie === "document" || (Array.isArray(ligne?.operations) && ligne.operations.length > 0);
}

// Données validées (validerIntervention) → colonnes à écrire.
export function donneesCorrection(ligne, donnees, operations = []) {
  const colonnes = {
    type: donnees.type,
    realise_le: donnees.realiseLe,
    kilometrage: donnees.kilometrage,
    prestataire: donnees.prestataire,
    montant_ttc: donnees.montantTtc,
    libelle: donnees.libelle,
    resultat_controle: donnees.resultatControle,
    // « Périodique » par défaut à l'écran : un contrôle dont la nature n'était
    // pas précisée le reste tant que la personne ne choisit pas.
    nature_controle: ligne.nature_controle == null && donnees.natureControle === "periodique" ? null : donnees.natureControle,
    controle_valable_jusqu_au: donnees.controleValableJusquAu,
  };
  if (avecOperations(ligne)) {
    const propres = operations
      .map((o) => ({ type: o.type || "autre", libelle: String(o.libelle ?? "").replace(/\s+/g, " ").trim().slice(0, 120) }))
      .filter((o) => o.libelle)
      .slice(0, 30);
    colonnes.operations = propres.length ? propres : null;
    colonnes.libelle = libelleOperations(propres) || null;
  }
  return colonnes;
}

// Colonnes réellement modifiées (vide : rien à enregistrer).
export function colonnesModifiees(ligne, colonnes) {
  return Object.keys(colonnes).filter((nom) => {
    const avant = ligne[nom];
    const apres = colonnes[nom];
    if (nom === "realise_le" || nom === "controle_valable_jusqu_au") return texte(avant).slice(0, 10) !== texte(apres).slice(0, 10);
    if (nom === "montant_ttc" || nom === "kilometrage") return (avant == null ? null : Number(avant)) !== (apres == null ? null : Number(apres));
    if (nom === "operations") return JSON.stringify(avant ?? null) !== JSON.stringify(apres ?? null);
    return texte(avant) !== texte(apres);
  });
}

// Ce qu'il faut signaler avant d'enregistrer la correction.
export function signalementsCorrection(ligne, colonnes, { historique = [], releves = [] }) {
  const autres = historique.filter((h) => h.id !== ligne.id);
  return {
    ressemblantes: interventionsRessemblantes(autres, { realiseLe: colonnes.realise_le, montantTtc: colonnes.montant_ttc, type: colonnes.type }),
    incoherencesKm:
      colonnes.kilometrage == null ? [] : incoherencesKilometrage({ releves, historique: autres }, { date: colonnes.realise_le, kilometrage: colonnes.kilometrage }),
  };
}
