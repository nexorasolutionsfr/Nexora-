import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifierStateSigne, comparerNonces } from "@/lib/google-oauth-state";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app";

// SÉCURITÉ (audit 2026-09-01, reconstruction du 2026-09-01) : l'ancienne
// route faisait confiance au paramètre `state` (= garage_id fourni par
// connect/route.ts, jamais signé ni lié à une session) pour choisir sur
// quel garage écrire les tokens Gmail via supabaseAdmin (service_role).
// Reconstruite : le `state` doit être signé par le serveur (voir
// lib/google-oauth-state.js) ET son nonce doit correspondre au cookie
// HttpOnly posé par connect/route.ts — anti-rejeu à deux facteurs (signature
// + possession du cookie du même navigateur), la propriété du garage est
// re-vérifiée ici (pas seulement au moment de la génération du state).
//
// Aucun token OAuth (code, access_token, refresh_token) n'est jamais passé
// à console.error — seul le nom de l'étape et un message générique le sont.

function errorRedirect(step) {
  console.error(`[oauth/google/callback] échec à l'étape "${step}"`);
  const response = NextResponse.redirect(`${APP_URL}/dashboard?email_connect=error&step=${step}`);
  response.cookies.set("google_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google/callback", maxAge: 0 });
  return response;
}

export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secretState = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!clientId || !clientSecret || !secretState) {
    return errorRedirect("configuration_manquante");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateBrut = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam || !code || !stateBrut) {
    return errorRedirect("params");
  }

  let statePayload;
  try {
    statePayload = verifierStateSigne(stateBrut);
  } catch {
    return errorRedirect("configuration_manquante");
  }
  if (!statePayload) {
    return errorRedirect("state_invalide");
  }

  const nonceCookie = request.cookies.get("google_oauth_nonce")?.value;
  if (!nonceCookie || !comparerNonces(nonceCookie, statePayload.nonce)) {
    return errorRedirect("anti_rejeu");
  }

  // Re-vérification de la propriété du garage au moment du callback — pas
  // seulement au moment de la génération du state (défense en profondeur :
  // le garage a pu changer de propriétaire entre-temps, cas limite mais
  // sans coût à couvrir ici).
  const { data: garage, error: garageError } = await supabaseAdmin
    .from("garages")
    .select("id")
    .eq("id", statePayload.garageId)
    .eq("owner_user_id", statePayload.userId)
    .maybeSingle();
  if (garageError || !garage) {
    return errorRedirect("acces_refuse");
  }
  const garageId = statePayload.garageId;

  try {
    const redirectUri = `${APP_URL}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return errorRedirect("token_exchange");
    }

    const tokens = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!refresh_token) {
      return errorRedirect("no_refresh_token");
    }

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : null;
    const emailAddress = profile?.emailAddress || null;

    const expiryDate = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    const { error: upsertError } = await supabaseAdmin.from("email_connections").upsert(
      {
        garage_id: garageId,
        provider: "google",
        email_address: emailAddress,
        access_token,
        refresh_token,
        token_expiry: expiryDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "garage_id" }
    );

    if (upsertError) {
      return errorRedirect("supabase_upsert");
    }

    const { error: updateError } = await supabaseAdmin
      .from("garages")
      .update({ gmail_connecte: true, gmail_adresse: emailAddress })
      .eq("id", garageId);

    if (updateError) {
      return errorRedirect("supabase_garage_update");
    }

    const response = NextResponse.redirect(`${APP_URL}/dashboard?email_connect=success`);
    response.cookies.set("google_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google/callback", maxAge: 0 });
    return response;
  } catch {
    return errorRedirect("exception");
  }
}
