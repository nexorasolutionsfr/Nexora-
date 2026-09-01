import { NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app";

// SÉCURITÉ (audit 2026-09-01) : cette route faisait confiance au paramètre
// `state` (= garage_id fourni par connect/route.ts, jamais signé ni lié à
// une session) pour choisir sur quel garage écrire les tokens Gmail via
// supabaseAdmin (service_role). Désactivée temporairement : aucun échange de
// code OAuth, aucune lecture/écriture de token, aucun appel à supabaseAdmin.
// Pour réactiver : ne reprendre l'échange de code qu'après avoir vérifié
// qu'un `state` signé correspond bien à l'utilisateur authentifié
// propriétaire du garage.
export async function GET() {
  return NextResponse.redirect(
    `${APP_URL}/dashboard?email_connect=error&step=disabled_for_security`
  );
}
