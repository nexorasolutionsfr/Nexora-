import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { DUREE_MIN_INSCRIPTION_MS, traiterInscription } from "@/lib/auto/acces";
import { accesAutoServeur } from "@/lib/auto/acces-serveur";
import { cheminSuite } from "@/components/auto/format";

// Créer un compte Nexora Auto pendant la bêta privée.
//
// Seule une adresse invitée (auto_acces_beta) est inscrite, mais la réponse
// est toujours « demande reçue », dans un délai minimal constant : personne ne
// peut savoir par ce formulaire si une adresse est invitée. L'e-mail de
// confirmation est celui de Supabase, comme pour toute inscription.
// Accès ouvert : la création de compte se fait directement depuis l'écran.
// Accès fermé : refus.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const debut = Date.now();
  const { mode } = await accesAutoServeur();

  let corps: { email?: unknown; motDePasse?: unknown; suite?: unknown } = {};
  try {
    corps = await request.json();
  } catch {
    corps = {};
  }

  const origine = new URL(request.url).origin;
  const suite = cheminSuite(typeof corps.suite === "string" ? corps.suite : "/auto");
  const personne = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await traiterInscription({
    mode,
    email: corps.email,
    motDePasse: corps.motDePasse,
    estInvite: async (adresse: string) => {
      const { data, error } = await supabaseAdmin.from("auto_acces_beta").select("email").eq("email", adresse).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    inscrire: (adresse: string, motDePasse: string) =>
      personne.auth.signUp({ email: adresse, password: motDePasse, options: { emailRedirectTo: `${origine}${suite}`, data: { espace: "auto" } } }),
  });

  if (resultat.statut === 200) await attendre(Math.max(0, DUREE_MIN_INSCRIPTION_MS - (Date.now() - debut)));
  return NextResponse.json(resultat.corps, { status: resultat.statut });
}
