// Lecture automatique activée ou non, d'après l'environnement du SERVEUR.
//
// Les appels payants n'ont lieu que si TOUT est réuni :
// - ANTHROPIC_API_KEY : clé du fournisseur, côté serveur seulement (jamais
//   NEXT_PUBLIC_, jamais dans le dépôt) ;
// - AUTO_LECTURE_BUDGET_USD : budget d'essai strictement positif ;
// - un modèle dont le tarif est connu (lib/auto/lecture/couts.js) ;
// - hors Production : bloqué sur le déploiement de production Vercel et sur
//   le projet Supabase de Production, sauf AUTO_LECTURE_PRODUCTION=oui.
// AUTO_LECTURE_QUOTA_24H (facultatif) règle le quota de lectures par compte.
//
// Pur et testé (couts.test.js).

import { TARIFS_USD_PAR_MILLION } from "./couts.js";

export const MODELE_PAR_DEFAUT = "claude-haiku-4-5-20251001";
const PROJET_PRODUCTION = "omphppsmhmyllapdqevn";

export function configurationLecture(env = {}) {
  const production = env.VERCEL_ENV === "production" || String(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PROJET_PRODUCTION);
  if (production && env.AUTO_LECTURE_PRODUCTION !== "oui") return { disponible: false, raison: "production" };
  if (!env.ANTHROPIC_API_KEY) return { disponible: false, raison: "cle_absente" };
  const budget = Number(env.AUTO_LECTURE_BUDGET_USD);
  if (!Number.isFinite(budget) || budget <= 0) return { disponible: false, raison: "budget_absent" };
  const modele = env.AUTO_LECTURE_MODELE || MODELE_PAR_DEFAUT;
  if (!TARIFS_USD_PAR_MILLION[modele]) return { disponible: false, raison: "modele_sans_tarif" };
  // Quota de lectures par compte sur 24 h : 10 par défaut, 50 au plus.
  const quota = Math.min(50, Math.max(1, Math.trunc(Number(env.AUTO_LECTURE_QUOTA_24H)) || 10));
  return { disponible: true, fournisseur: "anthropic", modele, budgetMicroUsd: Math.round(budget * 1e6), lecturesParCompte24h: quota };
}
