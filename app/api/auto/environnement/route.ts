import { NextResponse } from "next/server";

import { descriptionEnvironnement } from "@/lib/auto/acces";
import { accesAutoServeur } from "@/lib/auto/acces-serveur";

// À quelle base ce déploiement est-il relié, et où s'exécutent ses fonctions ?
//
// Sert à contrôler une prévisualisation Vercel en un coup d'œil : l'ouvrir
// dans le navigateur suffit, la protection Vercel s'applique. Aucune clé,
// aucun secret : l'identifiant du projet Supabase figure déjà dans le code
// servi au navigateur, et la région comme l'environnement sont des
// informations d'exécution.

export const dynamic = "force-dynamic";

export async function GET() {
  const { mode, raison } = await accesAutoServeur();
  return NextResponse.json({ ...descriptionEnvironnement(process.env), accesAuto: mode, raison: raison ?? null });
}
