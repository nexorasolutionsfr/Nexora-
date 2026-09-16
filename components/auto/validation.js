// Vérification des saisies Nexora Auto, avant tout envoi à la base.
//
// Chaque fonction reçoit ce que la personne a tapé (des chaînes) et rend
// { erreurs, avertissements, donnees } : `erreurs` bloque l'envoi, champ par
// champ ; `donnees` est prêt pour Supabase. La base revérifie tout de son
// côté (contraintes, déclencheurs) : ceci ne sert qu'à répondre tout de suite
// et en français.

import { formatImmatriculation, normaliserImmatriculation } from "../../lib/auto/immatriculation.js";
import { ENERGIES, TYPES_INTERVENTION, lireEntier, lireMontant } from "./format.js";

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const KM_MAX = 2000000;

function texte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function dateSaisie(valeur, { aujourdhui, obligatoire = false, libelleManquant }) {
  const v = texte(valeur);
  if (!v) return obligatoire ? { erreur: libelleManquant ?? "Indiquez une date." } : { valeur: null };
  if (!DATE_ISO.test(v) || v < "1900-01-01") return { erreur: "Cette date n'est pas valide." };
  if (v > aujourdhui) return { erreur: "La date ne peut pas être dans le futur." };
  return { valeur: v };
}

// Une date limite (procès-verbal) : dans le futur le plus souvent, et
// forcément après la date du contrôle.
function dateLimite(valeur, { apres }) {
  const v = texte(valeur);
  if (!v) return { valeur: null };
  if (!DATE_ISO.test(v) || v < "1900-01-01") return { erreur: "Cette date n'est pas valide." };
  if (apres && v <= apres) return { erreur: "Cette date doit suivre celle du contrôle." };
  return { valeur: v };
}

function resultat(erreurs, avertissements, donnees) {
  return { valide: Object.keys(erreurs).length === 0, erreurs, avertissements, donnees };
}

export function validerVehicule(saisie = {}, { aujourdhui, creation = false }) {
  const erreurs = {};
  const avertissements = {};
  const donnees = {};

  donnees.marque = texte(saisie.marque);
  if (!donnees.marque) erreurs.marque = "Indiquez la marque.";
  donnees.modele = texte(saisie.modele);
  if (!donnees.modele) erreurs.modele = "Indiquez le modèle.";

  const annee = texte(saisie.annee);
  donnees.annee = null;
  if (annee) {
    const n = lireEntier(annee);
    const anneeMax = Number(aujourdhui.slice(0, 4)) + 1;
    if (n === null || n < 1900 || n > anneeMax) erreurs.annee = "Cette année n'est pas valide.";
    else donnees.annee = n;
  }

  const energie = texte(saisie.energie);
  donnees.energie = null;
  if (energie) {
    if (ENERGIES.some((e) => e.valeur === energie)) donnees.energie = energie;
    else erreurs.energie = "Choisissez une énergie dans la liste.";
  }

  donnees.immatriculation = normaliserImmatriculation(saisie.immatriculation ?? "");
  if (donnees.immatriculation) {
    const format = formatImmatriculation(donnees.immatriculation);
    if (format === "invalide") erreurs.immatriculation = "Cette plaque n'est pas valide.";
    else if (format === "autre") avertissements.immatriculation = "Format inhabituel : vérifiez la plaque.";
  }

  const miseEnCirculation = dateSaisie(saisie.dateMiseEnCirculation, { aujourdhui });
  if (miseEnCirculation.erreur) erreurs.dateMiseEnCirculation = miseEnCirculation.erreur;
  donnees.dateMiseEnCirculation = miseEnCirculation.valeur ?? null;

  if (creation) {
    const km = texte(saisie.kilometrage);
    donnees.kilometrage = null;
    if (km) {
      const n = lireEntier(km);
      if (n === null || n > KM_MAX) erreurs.kilometrage = "Ce kilométrage n'est pas valide.";
      else donnees.kilometrage = n;
    }

    const dernier = dateSaisie(saisie.dernierControle, { aujourdhui });
    if (dernier.erreur) erreurs.dernierControle = dernier.erreur;
    donnees.dernierControle = dernier.valeur ?? null;
    if (donnees.dernierControle && donnees.dateMiseEnCirculation && donnees.dernierControle < donnees.dateMiseEnCirculation) {
      erreurs.dernierControle = "Le contrôle ne peut pas précéder la mise en circulation.";
    }

    const limite = dateLimite(saisie.controleValableJusquAu, { apres: donnees.dernierControle });
    if (limite.erreur) erreurs.controleValableJusquAu = limite.erreur;
    donnees.controleValableJusquAu = limite.valeur ?? null;
    if (donnees.controleValableJusquAu && !donnees.dernierControle && !erreurs.dernierControle) {
      erreurs.dernierControle = "Indiquez aussi la date du contrôle.";
    }
  }

  return resultat(erreurs, avertissements, donnees);
}

export function validerIntervention(saisie = {}, { aujourdhui }) {
  const erreurs = {};
  const donnees = {};

  donnees.type = texte(saisie.type);
  if (!TYPES_INTERVENTION.some((t) => t.valeur === donnees.type)) erreurs.type = "Choisissez le type d'intervention.";

  const date = dateSaisie(saisie.realiseLe, { aujourdhui, obligatoire: true, libelleManquant: "Indiquez la date de l'intervention." });
  if (date.erreur) erreurs.realiseLe = date.erreur;
  donnees.realiseLe = date.valeur ?? null;

  const km = texte(saisie.kilometrage);
  donnees.kilometrage = null;
  if (km) {
    const n = lireEntier(km);
    if (n === null || n > KM_MAX) erreurs.kilometrage = "Ce kilométrage n'est pas valide.";
    else donnees.kilometrage = n;
  }

  const montant = lireMontant(texte(saisie.montant));
  donnees.montantTtc = null;
  if (Number.isNaN(montant)) erreurs.montant = "Ce montant n'est pas valide.";
  else donnees.montantTtc = montant;

  donnees.prestataire = texte(saisie.prestataire).slice(0, 120) || null;
  donnees.libelle = texte(saisie.libelle).slice(0, 300) || null;

  // Résultat et date du procès-verbal : seulement pour un contrôle technique.
  donnees.resultatControle = null;
  donnees.controleValableJusquAu = null;
  if (donnees.type === "controle_technique") {
    const resultatControle = texte(saisie.resultatControle);
    if (resultatControle && !["favorable", "contre_visite"].includes(resultatControle)) erreurs.resultatControle = "Choisissez le résultat dans la liste.";
    else donnees.resultatControle = resultatControle || null;

    const limite = dateLimite(saisie.controleValableJusquAu, { apres: donnees.realiseLe });
    if (limite.erreur) erreurs.controleValableJusquAu = limite.erreur;
    donnees.controleValableJusquAu = limite.valeur ?? null;
  }

  return resultat(erreurs, {}, donnees);
}

export function validerReleve(saisie = {}, { aujourdhui }) {
  const erreurs = {};
  const donnees = {};

  const n = lireEntier(texte(saisie.kilometrage));
  if (n === null || n > KM_MAX) erreurs.kilometrage = "Indiquez le kilométrage affiché au compteur.";
  donnees.kilometrage = n;

  const date = dateSaisie(saisie.releveLe, { aujourdhui, obligatoire: true, libelleManquant: "Indiquez la date du relevé." });
  if (date.erreur) erreurs.releveLe = date.erreur;
  donnees.releveLe = date.valeur ?? null;

  return resultat(erreurs, {}, donnees);
}

export function validerIntervalle(saisie = {}) {
  const erreurs = {};
  const donnees = { km: null, mois: null };

  const km = texte(saisie.km);
  if (km) {
    const n = lireEntier(km);
    if (n === null || n < 1000 || n > 100000) erreurs.km = "Entre 1 000 et 100 000 km.";
    else donnees.km = n;
  }
  const mois = texte(saisie.mois);
  if (mois) {
    const n = lireEntier(mois);
    if (n === null || n < 1 || n > 60) erreurs.mois = "Entre 1 et 60 mois.";
    else donnees.mois = n;
  }
  if (!km && !mois) erreurs.km = "Indiquez au moins un kilométrage ou une durée.";

  return resultat(erreurs, {}, donnees);
}
