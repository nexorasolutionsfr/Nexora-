// Accès à Nexora Auto : fermé par défaut, bêta privée, ouvert.
//
// La règle qui protège les données est dans la base (migration
// 20260922001100 : politiques restrictives, `auto_acces_autorise`). Ce module
// décide seulement ce que le SERVEUR laisse afficher et accepte :
// - `AUTO_ACCES=ferme` ferme tout, sans toucher à la base (interrupteur
//   d'urgence) ;
// - une prévisualisation Vercel reliée à la base de Production est toujours
//   fermée (constaté le 17 septembre 2026 : les prévisualisations utilisent
//   les variables de Production) ;
// - sinon le mode enregistré en base ; illisible ou absent : fermé.
//
// Pur et testé (acces.test.js).

import { PROJET_PRODUCTION } from "./lecture/configuration.js";

export const MODES_ACCES = ["ferme", "beta", "ouvert"];

// Décision sans lire la base, quand elle suffit : { mode, raison } ou null.
export function fermetureImposee(env = {}) {
  if (env.AUTO_ACCES === "ferme") return { mode: "ferme", raison: "forcee" };
  if (env.VERCEL_ENV === "preview" && String(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PROJET_PRODUCTION)) {
    return { mode: "ferme", raison: "previsualisation_production" };
  }
  return null;
}

// { mode, raison } — raison null quand le mode vient de la base.
export function decisionAcces({ env = {}, modeBase = null, erreurBase = false } = {}) {
  const imposee = fermetureImposee(env);
  if (imposee) return imposee;
  if (erreurBase || !MODES_ACCES.includes(modeBase)) return { mode: "ferme", raison: "indisponible" };
  return { mode: modeBase, raison: null };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Créer un compte pendant la bêta, sans révéler si une adresse est invitée :
// la réponse est la même (« demande reçue ») qu'elle le soit ou non. Seules
// les erreurs de saisie, vérifiées AVANT de consulter la liste, sont dites.
// Dépendances injectées : estInvite(adresse) et inscrire(adresse, motDePasse).
export async function traiterInscription({ mode, email, motDePasse, estInvite, inscrire, journal = console }) {
  const adresse = String(email ?? "").trim().toLowerCase();
  if (mode === "ferme") return { statut: 403, corps: { etat: "ferme" } };
  if (!EMAIL.test(adresse) || adresse.length > 254) return { statut: 400, corps: { etat: "invalide", champ: "email" } };
  const mot = String(motDePasse ?? "");
  if (mot.length < 8 || mot.length > 72) return { statut: 400, corps: { etat: "invalide", champ: "mot_de_passe" } };
  let autorisee = mode === "ouvert";
  if (!autorisee) {
    try {
      autorisee = await estInvite(adresse);
    } catch {
      autorisee = false;
      journal.error("[inscription auto] liste des invitations illisible");
    }
  }
  if (autorisee) {
    try {
      const { error } = await inscrire(adresse, mot);
      // Jamais l'adresse dans le journal : seulement la nature du refus.
      if (error) journal.error("[inscription auto] inscription refusée", error.code ?? error.status ?? "erreur");
    } catch {
      journal.error("[inscription auto] inscription impossible");
    }
  }
  return { statut: 200, corps: { etat: "demande_recue" } };
}

// Durée minimale d'une réponse d'inscription : une adresse invitée ne doit pas
// se reconnaître à une réponse plus lente.
export const DUREE_MIN_INSCRIPTION_MS = 1500;
