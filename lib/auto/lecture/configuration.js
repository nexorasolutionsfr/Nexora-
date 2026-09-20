// Quelle lecture automatique, d'après l'environnement du SERVEUR.
//
// Par défaut : la lecture GRATUITE du texte des PDF (texte_pdf). Aucun coût,
// aucun envoi à l'extérieur ; les photos se renseignent à la main.
//
// La lecture payante par Claude (anthropic) ne s'active que si TOUT est réuni :
// - AUTO_LECTURE_FOURNISSEUR=anthropic, demandé explicitement ;
// - ANTHROPIC_API_KEY : clé côté serveur seulement (jamais NEXT_PUBLIC_, jamais
//   dans le dépôt) ;
// - AUTO_LECTURE_BUDGET_USD : budget d'essai strictement positif ;
// - un modèle dont le tarif est connu (lib/auto/lecture/couts.js) ;
// - hors Production : bloquée sur le déploiement de production Vercel et sur
//   le projet Supabase de Production, sauf AUTO_LECTURE_PRODUCTION=oui.
// AUTO_LECTURE_FOURNISSEUR=aucun désactive toute lecture.
// AUTO_LECTURE_QUOTA_24H (facultatif) règle le quota de lectures par compte.
//
// Pur et testé (couts.test.js).

import { TARIFS_USD_PAR_MILLION } from "./couts.js";
import { FORMATS_LISIBLES } from "./limites.js";
import { VERSION_REGLES } from "./regles.js";
import { integrationsSortantes } from "../../integrations.js";

export const MODELE_PAR_DEFAUT = "claude-haiku-4-5-20251001";
export const PROJET_PRODUCTION = "omphppsmhmyllapdqevn";

export function configurationLecture(env = {}) {
  const quota = Math.min(50, Math.max(1, Math.trunc(Number(env.AUTO_LECTURE_QUOTA_24H)) || 10));
  const choix = env.AUTO_LECTURE_FOURNISSEUR || "texte_pdf";

  if (choix === "aucun") return { disponible: false, raison: "desactivee" };
  if (choix === "texte_pdf") {
    return { disponible: true, fournisseur: "texte_pdf", modele: VERSION_REGLES, gratuit: true, formats: ["application/pdf"], budgetMicroUsd: null, lecturesParCompte24h: quota };
  }
  if (choix !== "anthropic") return { disponible: false, raison: "fournisseur_inconnu" };
  // Payante : jamais sur une prévisualisation (lib/integrations.js).
  if (!integrationsSortantes(env).actives) return { disponible: false, raison: "previsualisation" };

  const production = env.VERCEL_ENV === "production" || String(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PROJET_PRODUCTION);
  if (production && env.AUTO_LECTURE_PRODUCTION !== "oui") return { disponible: false, raison: "production" };
  if (!env.ANTHROPIC_API_KEY) return { disponible: false, raison: "cle_absente" };
  const budget = Number(env.AUTO_LECTURE_BUDGET_USD);
  if (!Number.isFinite(budget) || budget <= 0) return { disponible: false, raison: "budget_absent" };
  const modele = env.AUTO_LECTURE_MODELE || MODELE_PAR_DEFAUT;
  if (!TARIFS_USD_PAR_MILLION[modele]) return { disponible: false, raison: "modele_sans_tarif" };
  return { disponible: true, fournisseur: "anthropic", modele, gratuit: false, formats: FORMATS_LISIBLES, budgetMicroUsd: Math.round(budget * 1e6), lecturesParCompte24h: quota };
}
