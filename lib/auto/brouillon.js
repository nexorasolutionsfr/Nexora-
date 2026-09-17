// Brouillon d'une facture en cours de vérification : ce que la personne a
// modifié à l'écran, gardé sur CET appareil jusqu'à l'enregistrement.
//
// - Quitter l'écran (appel, autre application, onglet fermé) ne fait rien
//   perdre : la facture est déjà dans le dossier, la proposition lue est en
//   base, et les modifications sont reprises au retour.
// - Une clé par document ; périmé après 7 jours ; effacé à l'enregistrement,
//   quand le document est gardé tel quel, et à la déconnexion.
// - Relu avec méfiance : un brouillon abîmé ou d'un ancien format est ignoré.
//
// Stockage injecté (localStorage à l'écran) : pur et testé (brouillon.test.js).

import { CHAMPS_FACTURE, saisieVide } from "./factures.js";

const PREFIXE = "nexora-auto-brouillon-facture:";
const VERSION = 1;
export const DUREE_BROUILLON_MS = 7 * 24 * 60 * 60 * 1000;

const CHAMPS_TEXTE = Object.keys(saisieVide()).filter((nom) => nom !== "operations");
const MODES = new Set(["intervention", "document"]);

function nettoyer(contenu) {
  if (!contenu || typeof contenu !== "object") return null;
  const { saisie, choix = "", mode = "intervention", touches = [] } = contenu;
  if (!saisie || typeof saisie !== "object") return null;
  if (!CHAMPS_TEXTE.every((nom) => typeof saisie[nom] === "string" && saisie[nom].length <= 200)) return null;
  const operations = saisie.operations;
  if (!Array.isArray(operations) || operations.length > 30) return null;
  if (!operations.every((o) => o && typeof o.type === "string" && typeof o.libelle === "string" && o.libelle.length <= 120)) return null;
  if (typeof choix !== "string" || choix.length > 40 || !MODES.has(mode)) return null;
  if (!Array.isArray(touches) || !touches.every((t) => CHAMPS_FACTURE.includes(t))) return null;
  return {
    saisie: { ...Object.fromEntries(CHAMPS_TEXTE.map((nom) => [nom, saisie[nom]])), operations: operations.map((o) => ({ type: o.type, libelle: o.libelle })) },
    choix,
    mode,
    touches: [...new Set(touches)],
  };
}

export function lireBrouillon(documentId, { stockage, maintenant = Date.now() } = {}) {
  try {
    const brut = stockage?.getItem(PREFIXE + documentId);
    if (!brut) return null;
    const enregistre = JSON.parse(brut);
    const perime = enregistre?.version !== VERSION || !Number.isFinite(enregistre.le) || maintenant - enregistre.le > DUREE_BROUILLON_MS;
    const contenu = perime ? null : nettoyer(enregistre);
    if (!contenu) stockage.removeItem(PREFIXE + documentId);
    return contenu;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(documentId, contenu, { stockage, maintenant = Date.now() } = {}) {
  const propre = nettoyer(contenu);
  if (!propre) return false;
  try {
    stockage?.setItem(PREFIXE + documentId, JSON.stringify({ version: VERSION, le: maintenant, ...propre }));
    return Boolean(stockage);
  } catch {
    return false;
  }
}

export function effacerBrouillon(documentId, { stockage } = {}) {
  try {
    stockage?.removeItem(PREFIXE + documentId);
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

// À la déconnexion : aucun brouillon ne reste sur l'appareil.
export function effacerBrouillons({ stockage } = {}) {
  try {
    const cles = [];
    for (let i = 0; i < stockage.length; i += 1) {
      const cle = stockage.key(i);
      if (cle?.startsWith(PREFIXE)) cles.push(cle);
    }
    for (const cle of cles) stockage.removeItem(cle);
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

// localStorage quand il existe et répond ; sinon aucun brouillon.
export function stockageNavigateur() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
