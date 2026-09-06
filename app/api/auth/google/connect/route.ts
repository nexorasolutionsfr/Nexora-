import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { creerStateSigne, genererNonce } from "@/lib/google-oauth-state";

// SÉCURITÉ (audit 2026-09-01, reconstruction du 2026-09-01) : l'ancienne
// route acceptait un `garage_id` fourni par l'appelant dans la query string
// et le recopiait tel quel dans `state` OAuth, sans jamais vérifier que
// l'appelant est authentifié comme propriétaire de ce garage. Reconstruite
// en POST, appelée depuis le dashboard (session déjà ouverte) avec le token
// d'accès Supabase en en-tête Authorization — jamais en query string (pour
// ne jamais apparaître dans un log d'accès HTTP), et retourne l'URL Google à
// suivre plutôt que de rediriger directement, pour pouvoir vérifier
// l'authentification et la propriété du garage AVANT tout envoi vers Google.
//
// Échec fermé : toute variable d'environnement requise absente (secret de
// state, identifiants Google) fait échouer la requête (503), jamais un
// comportement dégradé silencieux.

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function POST(request) {
  const secretState = process.env.GOOGLE_OAUTH_STATE_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!secretState || !clientId) {
    return NextResponse.json({ error: "configuration_manquante" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "authentification_requise" }, { status: 401 });
  }

  // Vérification de la session Supabase — jamais une simple lecture de
  // cookie/claim non vérifiée : auth.getUser() revalide le token auprès de
  // Supabase Auth.
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "authentification_invalide" }, { status: 401 });
  }
  const userId = userData.user.id;

  let garageId;
  try {
    const body = await request.json();
    garageId = body?.garageId;
  } catch {
    garageId = null;
  }
  if (!garageId) {
    return NextResponse.json({ error: "garage_manquant" }, { status: 400 });
  }

  // Propriété du garage vérifiée côté serveur avec le rôle service — jamais
  // déléguée au client, jamais supposée à partir du seul token.
  const { data: garage, error: garageError } = await supabaseAdmin
    .from("garages")
    .select("id")
    .eq("id", garageId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (garageError || !garage) {
    return NextResponse.json({ error: "acces_refuse" }, { status: 403 });
  }

  const nonce = genererNonce();
  const state = creerStateSigne({ garageId, userId, nonce });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app"}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPE,
    state,
  });

  const response = NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  // Nonce lié à un cookie HttpOnly/Secure/SameSite=Lax, vérifié au callback
  // pour empêcher le rejeu d'un state signé capturé ailleurs (ex. logs
  // d'un proxy) : sans le cookie correspondant, le state seul ne suffit
  // jamais à passer le callback.
  response.cookies.set("google_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/google/callback",
    maxAge: 600,
  });
  return response;
}
