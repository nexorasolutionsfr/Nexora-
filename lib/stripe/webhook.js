// Webhook Stripe : vérification de la signature, et traduction d'un événement
// en état d'abonnement.
//
// Module pur, sans réseau, sans Supabase, sans React — comme lib/facturx. Tout
// ce qui décide y est testable en une milliseconde ; la route HTTP au-dessus ne
// fait plus que lire une requête et écrire une ligne.
//
// POURQUOI LA SIGNATURE EST NON NÉGOCIABLE
//
// L'URL du webhook est publique. Sans vérification, n'importe qui peut poster
// « abonnement actif » pour le garage de son choix et s'offrir Nexora à vie.
// C'est la seule chose qui sépare cette route d'un formulaire ouvert.

import { createHmac, timingSafeEqual } from "node:crypto";

export class ErreurWebhook extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ErreurWebhook";
    this.code = code;
  }
}

/** Cinq minutes : la tolérance recommandée par Stripe contre le rejeu. */
export const TOLERANCE_SECONDES = 300;

/**
 * Découpe l'en-tête `Stripe-Signature`, de la forme :
 *   t=1712345678,v1=5257a869e7...,v1=... ,v0=...
 * Plusieurs `v1` coexistent pendant une rotation de secret ; il faut donc
 * toutes les garder, pas seulement la première.
 */
export function decouperEntete(entete) {
  if (typeof entete !== "string" || entete === "") {
    throw new ErreurWebhook("En-tête Stripe-Signature absent", "signature_absente");
  }
  let horodatage = null;
  const signatures = [];
  for (const partie of entete.split(",")) {
    const separateur = partie.indexOf("=");
    if (separateur < 0) continue;
    const cle = partie.slice(0, separateur).trim();
    const valeur = partie.slice(separateur + 1).trim();
    if (cle === "t") horodatage = valeur;
    else if (cle === "v1") signatures.push(valeur);
  }
  if (horodatage === null || !/^\d+$/.test(horodatage) || signatures.length === 0) {
    throw new ErreurWebhook("En-tête Stripe-Signature illisible", "signature_illisible");
  }
  return { horodatage: Number(horodatage), signatures };
}

/** Comparaison à durée constante. Deux longueurs différentes = faux, sans fuite. */
function egalesSansFuite(a, b) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Vérifie la signature d'un corps BRUT. Le corps doit être la chaîne reçue
 * telle quelle : un JSON.parse suivi d'un JSON.stringify change les espaces et
 * l'ordre des clés, donc l'empreinte, donc fait échouer toute signature valide.
 *
 * @param {string} corpsBrut
 * @param {string} entete       valeur de `Stripe-Signature`
 * @param {string} secret       STRIPE_WEBHOOK_SECRET (whsec_...)
 * @param {{maintenantSecondes?: number, toleranceSecondes?: number}} options
 */
export function verifierSignature(corpsBrut, entete, secret, options = {}) {
  if (typeof secret !== "string" || secret === "") {
    throw new ErreurWebhook("Secret de webhook absent", "secret_absent");
  }
  const { horodatage, signatures } = decouperEntete(entete);

  const maintenant = options.maintenantSecondes ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSecondes ?? TOLERANCE_SECONDES;
  // Écart dans les deux sens : un événement trop vieux est un rejeu, un
  // événement trop dans le futur est une horloge fausse ou une contrefaçon.
  if (Math.abs(maintenant - horodatage) > tolerance) {
    throw new ErreurWebhook("Événement hors de la fenêtre de tolérance", "horodatage_hors_fenetre");
  }

  const attendue = createHmac("sha256", secret)
    .update(`${horodatage}.${corpsBrut}`, "utf8")
    .digest("hex");

  if (!signatures.some((s) => egalesSansFuite(s, attendue))) {
    throw new ErreurWebhook("Signature invalide", "signature_invalide");
  }
  return true;
}

// ── Traduction d'un événement en état d'abonnement ──────────────────────────

/**
 * Statuts Stripe qui laissent l'accès ouvert.
 *
 * `past_due` en fait partie, et c'est un choix. Stripe relance une carte
 * refusée pendant environ trois semaines avant d'abandonner. Fermer l'atelier
 * à la première relance, c'est couper un garage de ses factures pour une carte
 * expirée — et provoquer exactement l'appel au support qu'on cherche à
 * supprimer. Quand Stripe renonce vraiment, le statut devient `unpaid` ou
 * `canceled`, et là l'accès se ferme.
 */
export const STATUTS_OUVERTS = new Set(["trialing", "active", "past_due"]);

/** Clés d'offre de lib/tarifs.ts. La base porte la même liste en contrainte. */
export const FORFAITS = new Set(["essentiel", "atelier", "atelier-plus"]);

function periodiciteDepuisAbonnement(abonnement) {
  const intervalle = abonnement?.items?.data?.[0]?.price?.recurring?.interval;
  if (intervalle === "year") return "annuel";
  if (intervalle === "month") return "mensuel";
  return null;
}

function forfaitValide(valeur) {
  return typeof valeur === "string" && FORFAITS.has(valeur) ? valeur : null;
}

function uuidValide(valeur) {
  return typeof valeur === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur)
    ? valeur
    : null;
}

/**
 * Traduit un événement Stripe en une écriture à faire, ou `null` si
 * l'événement ne nous concerne pas.
 *
 * Retourne :
 *   { cible: { colonne, valeur }, champs: {...}, evenementLe: Date, ecraserLesNuls }
 *
 * `ecraserLesNuls` dit à l'appelant quoi faire d'un champ à `null`. Sur un
 * abonnement fermé, `forfait: null` est une décision qu'il faut écrire. Sur un
 * simple rattachement de session, `null` veut dire « je n'en sais rien », et
 * l'écrire effacerait un forfait déjà connu.
 *
 * `cible` dit COMMENT retrouver le garage. Deux chemins, dans cet ordre :
 *   - `id`, quand l'événement porte le garage en métadonnée. C'est le cas
 *     normal : la session de paiement l'y écrit.
 *   - `stripe_subscription_id`, sinon. Filet pour les abonnements modifiés
 *     depuis le tableau de bord Stripe, qui n'ont pas de métadonnée fraîche.
 *
 * Stripe ne garantit ni l'ordre ni l'unicité de livraison. `evenementLe` sert
 * à l'appelant pour ignorer un événement plus ancien que le dernier appliqué.
 */
export function ecritureDepuisEvenement(evenement) {
  const type = evenement?.type;
  const objet = evenement?.data?.object;
  if (!type || !objet) {
    throw new ErreurWebhook("Événement Stripe illisible", "evenement_illisible");
  }
  const evenementLe = new Date((evenement.created ?? 0) * 1000);

  if (type === "checkout.session.completed") {
    // Cet événement ne dit rien du statut de l'abonnement — il dit seulement
    // qui a payé quoi. Il sert à NOUER le garage à Stripe ; c'est
    // `customer.subscription.*` qui décide de l'accès. Ne pas confondre les
    // deux évite d'ouvrir un accès sur un paiement encore en cours.
    const garageId = uuidValide(objet.client_reference_id) || uuidValide(objet.metadata?.garage_id);
    if (!garageId) {
      throw new ErreurWebhook(
        "Session de paiement sans garage rattaché",
        "garage_absent",
      );
    }
    const champs = {
      stripe_customer_id: typeof objet.customer === "string" ? objet.customer : null,
      stripe_subscription_id: typeof objet.subscription === "string" ? objet.subscription : null,
      forfait: forfaitValide(objet.metadata?.offre),
      abonnement_periodicite:
        objet.metadata?.periodicite === "annuel" ? "annuel"
        : objet.metadata?.periodicite === "mensuel" ? "mensuel"
        : null,
    };
    return { cible: { colonne: "id", valeur: garageId }, champs, evenementLe, ecraserLesNuls: false };
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const abonnementId = typeof objet.id === "string" ? objet.id : null;
    if (!abonnementId) {
      throw new ErreurWebhook("Abonnement Stripe sans identifiant", "abonnement_sans_id");
    }
    // `deleted` peut arriver avec un statut déjà à `canceled`, mais pas
    // toujours : on le force, c'est le sens même de l'événement.
    const statut = type === "customer.subscription.deleted"
      ? "canceled"
      : (typeof objet.status === "string" ? objet.status : "incomplete");
    const ouvert = STATUTS_OUVERTS.has(statut);

    const garageId = uuidValide(objet.metadata?.garage_id);
    const cible = garageId
      ? { colonne: "id", valeur: garageId }
      : { colonne: "stripe_subscription_id", valeur: abonnementId };

    const champs = {
      abonnement_statut: statut,
      abonnement_actif: ouvert,
      stripe_subscription_id: abonnementId,
      stripe_customer_id: typeof objet.customer === "string" ? objet.customer : null,
      // Un abonnement fermé ne laisse pas un forfait derrière lui : le
      // tableau de bord par forfait lirait une offre que personne ne paie.
      forfait: ouvert ? forfaitValide(objet.metadata?.offre) : null,
      abonnement_periodicite: ouvert ? periodiciteDepuisAbonnement(objet) : null,
    };
    return { cible, champs, evenementLe, ecraserLesNuls: true };
  }

  // Tout le reste est reçu, accusé, et ignoré. Répondre 200 à un événement
  // qu'on ne traite pas évite que Stripe le rejoue indéfiniment.
  return null;
}
