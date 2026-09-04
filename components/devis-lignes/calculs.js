// Devis multi-lignes V1 — logique pure (calculs, validations, conversion,
// traduction d'erreurs). Aucun accès réseau : ces fonctions reçoivent des
// données déjà chargées et ne font que les dériver ou les valider.
//
// RÈGLE D'OR : la base est la seule source de vérité des montants.
// devis_lignes.montant_ht et montant_tva sont des colonnes générées, et
// devis.montant_ht / montant_ttc sont maintenus par trigger
// (supabase/migrations/20260904000100_devis_lignes_v1.sql). Ce module ne
// fait que REPRODUIRE exactement la même règle d'arrondi pour un affichage
// immédiat, sans attendre l'aller-retour serveur — jamais pour la remplacer.

import { TAUX_TVA_DEFAUT } from "./devisLignesConstants.js";

/**
 * Arrondi à 2 décimales, demi vers le haut, identique à round(numeric, 2)
 * de PostgreSQL sur des valeurs positives ou nulles (les seules possibles
 * ici : quantite > 0, prix >= 0, taux >= 0).
 *
 * La garde 1e-9 corrige la représentation binaire des demi-cents : en
 * JavaScript 1.005 * 100 vaut 100.49999999999999 et s'arrondirait à 1.00,
 * là où numeric donne 1.01. Les entrées ayant au plus 3 décimales (quantité)
 * et 2 (prix, taux), les produits ont une granularité d'au moins 1e-6 :
 * une garde de 1e-9 ne peut donc jamais faire basculer une valeur
 * légitimement inférieure au demi-cent.
 */
export function arrondir2(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return 0;
  const signe = n < 0 ? -1 : 1;
  return (signe * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

/**
 * Montants d'une ligne, exactement comme les colonnes générées :
 *   montant_ht  = round(quantite * prix_unitaire_ht, 2)
 *   montant_tva = round(round(quantite * prix_unitaire_ht, 2) * taux_tva / 100, 2)
 * Arrondi PAR LIGNE, HT puis TVA — jamais l'inverse (contrat D.3).
 */
export function calculerLigne({ quantite, prix_unitaire_ht, taux_tva }) {
  const q = Number(quantite);
  const p = Number(prix_unitaire_ht);
  const t = Number(taux_tva);
  if (![q, p, t].every(Number.isFinite)) {
    return { montant_ht: 0, montant_tva: 0, montant_ttc: 0 };
  }
  const montant_ht = arrondir2(q * p);
  const montant_tva = arrondir2((montant_ht * t) / 100);
  return { montant_ht, montant_tva, montant_ttc: arrondir2(montant_ht + montant_tva) };
}

/**
 * Totaux d'un devis : somme des montants PAR LIGNE déjà arrondis (jamais un
 * arrondi du total). Si la ligne vient de la base, ses colonnes générées
 * font foi ; sinon elles sont recalculées avec la même règle. Un devis sans
 * ligne vaut 0 — jamais NaN, jamais null.
 */
export function calculerTotaux(lignes) {
  const liste = Array.isArray(lignes) ? lignes : [];
  let total_ht = 0;
  let total_tva = 0;
  for (const ligne of liste) {
    const depuisBase = ligne.montant_ht != null && ligne.montant_tva != null;
    const { montant_ht, montant_tva } = depuisBase
      ? { montant_ht: Number(ligne.montant_ht), montant_tva: Number(ligne.montant_tva) }
      : calculerLigne(ligne);
    total_ht = arrondir2(total_ht + montant_ht);
    total_tva = arrondir2(total_tva + montant_tva);
  }
  return { total_ht, total_tva, total_ttc: arrondir2(total_ht + total_tva), nb_lignes: liste.length };
}

/**
 * Miroir exact de public.devis_statut_modifiable(text) : FERMÉ PAR DÉFAUT.
 * NULL, undefined et tout statut inconnu sont verrouillés (contrat G.4).
 * Garde-fou d'affichage uniquement — la base reste la seule autorité.
 */
export function devisStatutModifiable(statut) {
  return statut === "brouillon" || statut === "en_attente";
}

/** Le devis porte-t-il des lignes ? Sinon c'est un devis mono-prestation historique. */
export function devisALignes(devis) {
  return Array.isArray(devis?.devis_lignes) && devis.devis_lignes.length > 0;
}

/**
 * Validation d'une ligne de devis — reproduit les contraintes CHECK de
 * devis_lignes. Contrairement à l'OR, le prix HT est OBLIGATOIRE : une
 * ligne de devis engage un montant, elle ne peut pas rester une estimation
 * vide.
 */
export function validerLigneDevisForm({ type, libelle, quantite, prix_unitaire_ht, taux_tva }) {
  const erreurs = {};

  if (type !== "main_oeuvre" && type !== "piece") {
    erreurs.type = "Type de ligne invalide.";
  }
  if (!libelle || !String(libelle).trim()) {
    erreurs.libelle = "Le libellé est obligatoire.";
  }
  const q = Number(quantite);
  if (quantite === "" || quantite == null || !Number.isFinite(q) || q <= 0) {
    erreurs.quantite = "La quantité doit être un nombre strictement positif.";
  }
  const p = Number(prix_unitaire_ht);
  if (prix_unitaire_ht === "" || prix_unitaire_ht == null || !Number.isFinite(p) || p < 0) {
    erreurs.prix_unitaire_ht = "Le prix unitaire HT est obligatoire et doit être nul ou positif.";
  }
  const t = Number(taux_tva);
  if (taux_tva === "" || taux_tva == null || !Number.isFinite(t) || t < 0 || t > 100) {
    erreurs.taux_tva = "Le taux de TVA doit être compris entre 0 et 100.";
  }

  return { valide: Object.keys(erreurs).length === 0, erreurs };
}

/** Charge utile typée pour insert/update, à partir des champs d'un formulaire validé. */
export function normaliserLigneDevis({ type, libelle, quantite, prix_unitaire_ht, taux_tva, prestation_id }) {
  return {
    type,
    libelle: String(libelle).trim(),
    quantite: Number(quantite),
    prix_unitaire_ht: arrondir2(prix_unitaire_ht),
    taux_tva: Number(taux_tva),
    prestation_id: prestation_id || null,
  };
}

/** Ordre d'affichage : position, puis date de création (stabilité). */
export function trierLignes(lignes) {
  return (Array.isArray(lignes) ? lignes : []).slice().sort((a, b) => {
    const pa = Number(a.position ?? 0);
    const pb = Number(b.position ?? 0);
    if (pa !== pb) return pa - pb;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

/**
 * Déplace une ligne d'un cran et renumérote les positions 0..n-1.
 * Renvoie la nouvelle liste et les positions à persister (uniquement celles
 * qui changent). Hors bornes : aucune modification.
 */
export function deplacerLigne(lignes, index, direction) {
  const liste = trierLignes(lignes);
  const cible = index + (direction === "haut" ? -1 : 1);
  if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) {
    return { lignes: liste, positionsAChanger: [] };
  }
  const copie = liste.slice();
  [copie[index], copie[cible]] = [copie[cible], copie[index]];
  const positionsAChanger = [];
  const resultat = copie.map((l, i) => {
    if (Number(l.position ?? 0) !== i) positionsAChanger.push({ id: l.id, position: i });
    return { ...l, position: i };
  });
  return { lignes: resultat, positionsAChanger };
}

/**
 * Pré-remplissage depuis une prestation : libellé et prix sont COPIÉS dans
 * le formulaire, puis le garage reste libre de les écraser. La prestation
 * n'est jamais relue ensuite (contrat D.1) — prestation_id n'enregistre
 * qu'une provenance.
 */
export function preremplirDepuisPrestation(prestation) {
  if (!prestation) return null;
  const prix = prestation.prix_ht;
  return {
    type: "main_oeuvre",
    libelle: prestation.nom || "",
    prix_unitaire_ht: prix == null || prix === "" ? "" : arrondir2(prix),
    taux_tva: TAUX_TVA_DEFAUT,
    prestation_id: prestation.id || null,
  };
}

/**
 * Reprise devis -> OR, PAR VALEUR (contrat I) : type, libellé, quantité et
 * prix unitaire sont copiés ; l'OR devient indépendant du devis. Les lignes
 * d'OR n'ont pas de TVA (estimation interne) et duree_minutes reste nulle —
 * la contrainte OR impose null pour une pièce et n'exige rien pour la
 * main-d'œuvre.
 */
export function lignesDevisVersOR(lignes) {
  return trierLignes(lignes).map((l) => ({
    type: l.type,
    libelle: l.libelle,
    quantite: Number(l.quantite),
    prix_unitaire_ht: l.prix_unitaire_ht == null ? null : arrondir2(l.prix_unitaire_ht),
    // Le taux de TVA suit la ligne jusqu'à l'OR : sans lui, une facture
    // établie depuis un OR terminé ne peut pas calculer sa TVA (recette
    // pilote du 2026-09-04). Repli sur le taux par défaut seulement si la
    // ligne d'origine n'en portait pas.
    taux_tva: l.taux_tva == null ? TAUX_TVA_DEFAUT : Number(l.taux_tva),
    duree_minutes: null,
  }));
}

export function formatEuro(valeur) {
  const n = Number(valeur);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",")} €`;
}

/**
 * Traduit une erreur Postgres/PostgREST en message métier sobre. Les
 * sous-chaînes sont reprises mot pour mot des `raise exception` et des noms
 * de contraintes de 20260904000100_devis_lignes_v1.sql — jamais inventées.
 */
export function traduireErreurDevisLignes(error) {
  if (!error) return "Une erreur est survenue. Réessayez.";
  const message = error.message || "";

  if (error.code === "23514" || message.includes("violates check constraint")) {
    if (message.includes("devis_lignes_quantite_positive")) return "La quantité doit être strictement positive.";
    if (message.includes("devis_lignes_prix_positif")) return "Le prix unitaire HT doit être nul ou positif.";
    if (message.includes("devis_lignes_taux_tva_borne")) return "Le taux de TVA doit être compris entre 0 et 100.";
    if (message.includes("devis_lignes_libelle_non_vide")) return "Le libellé est obligatoire.";
    if (message.includes("devis_lignes_type_valide")) return "Type de ligne invalide.";
    return "Cette ligne ne respecte pas les règles de saisie.";
  }
  if (error.code === "42501") {
    return "Cette action n'est pas autorisée sur ce devis.";
  }
  if (message.includes("le devis est verrouille")) {
    return "Ce devis est verrouillé : ses lignes ne peuvent plus être modifiées.";
  }
  if (message.includes("ne peut pas etre supprime")) {
    return "Un devis verrouillé ne peut pas être supprimé.";
  }
  if (message.includes("ne peut plus etre modifie")) {
    return "Ce devis est verrouillé et ne peut plus être modifié.";
  }
  if (message.includes("devis introuvable ou hors garage")) {
    return "Ce devis n'est plus disponible.";
  }
  if (message.includes("garage_id incoherent")) {
    return "Cette ligne ne correspond pas au garage de ce devis.";
  }
  if (message.includes("prestation hors garage")) {
    return "Cette prestation n'appartient pas à ce garage.";
  }
  return "Une erreur est survenue. Réessayez.";
}
