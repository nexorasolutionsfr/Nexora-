import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { estIdentifiant } from "@/lib/auto/identifiants";
import { creerFournisseurAnthropic } from "@/lib/auto/lecture/anthropic";
import { configurationLecture } from "@/lib/auto/lecture/configuration";
import { LIMITES_LECTURE } from "@/lib/auto/lecture/limites";
import { lireFacture } from "@/lib/auto/lecture/service";

// Lire une facture déposée par la personne connectée (lot E).
//
// La clé du fournisseur et le budget restent côté serveur. La personne est
// identifiée par son jeton de session ; le document et le fichier sont lus
// avec SES droits (RLS, stockage privé). Seuls la réservation sur le budget
// et le journal des coûts passent par le rôle de service. Voir
// lib/auto/lecture/service.js pour le détail et les limites.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUT_HTTP: Record<string, number> = { introuvable: 404, deja_enregistree: 409 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!estIdentifiant(id)) return NextResponse.json({ etat: "introuvable" }, { status: 404 });

  const jeton = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return NextResponse.json({ etat: "non_connecte" }, { status: 401 });
  const { data: utilisateur, error: erreurUtilisateur } = await supabaseAdmin.auth.getUser(jeton);
  if (erreurUtilisateur || !utilisateur?.user) return NextResponse.json({ etat: "non_connecte" }, { status: 401 });

  let relire = false;
  try {
    relire = (await request.json())?.relire === true;
  } catch {
    relire = false;
  }

  const clientPersonne = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const configuration = configurationLecture(process.env);
  const resultat = await lireFacture({
    documentId: id,
    utilisateurId: utilisateur.user.id,
    relire,
    configuration,
    clientPersonne,
    clientServeur: supabaseAdmin,
    creerFournisseur: (c: { modele: string }) =>
      creerFournisseurAnthropic({
        cle: process.env.ANTHROPIC_API_KEY as string,
        modele: c.modele,
        jetonsSortieMax: LIMITES_LECTURE.jetonsSortieMax,
        delaiMs: LIMITES_LECTURE.delaiMs,
      }),
    aujourdhui: aujourdhuiIso(),
  });

  return NextResponse.json(resultat, { status: STATUT_HTTP[resultat.etat] ?? 200 });
}
