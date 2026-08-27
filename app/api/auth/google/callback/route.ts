import { NextResponse } from "next/server";
import { verifyGoogleOAuthState } from "@/lib/google-oauth-state";
import { hasActiveGarageFeature } from "@/lib/garage-features";
import { supabaseAdmin } from "@/lib/supabase-admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app";

function errorRedirect(redirectBase: string, step: string, detail?: unknown) {
  console.error(`[oauth/google/callback] échec à l'étape "${step}"`, detail ? { detail } : undefined);
  return NextResponse.redirect(`${redirectBase}?email_connect=error&step=${step}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectBase = `${APP_URL}/dashboard`;

  if (errorParam || !code || !rawState) {
    return errorRedirect(redirectBase, "params", { error: errorParam || "missing_parameter" });
  }

  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.OAUTH_STATE_SECRET) {
      return errorRedirect(redirectBase, "configuration");
    }

    const state = verifyGoogleOAuthState(rawState);
    if (!state) {
      return errorRedirect(redirectBase, "state");
    }

    const { data: garage, error: garageError } = await supabaseAdmin
      .from("garages")
      .select("id")
      .eq("id", state.garageId)
      .eq("owner_user_id", state.userId)
      .maybeSingle();

    if (garageError || !garage) {
      return errorRedirect(redirectBase, "authorization");
    }

    const { data: entitlements, error: entitlementsError } = await supabaseAdmin
      .from("garage_entitlements")
      .select("active, trial_ends_at, enabled_features")
      .eq("garage_id", garage.id)
      .maybeSingle();

    if (entitlementsError || !hasActiveGarageFeature(entitlements, "gmail")) {
      return errorRedirect(redirectBase, "gmail_entitlement");
    }

    const redirectUri = `${APP_URL}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return errorRedirect(redirectBase, "token_exchange", { status: tokenRes.status });
    }

    const tokens = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token || !refresh_token) {
      return errorRedirect(redirectBase, "missing_token");
    }

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) {
      return errorRedirect(redirectBase, "gmail_profile", { status: profileRes.status });
    }
    const profile = await profileRes.json();
    const emailAddress = profile?.emailAddress;
    if (!emailAddress) {
      return errorRedirect(redirectBase, "gmail_address");
    }

    const expiryDate = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    const { error: upsertError } = await supabaseAdmin.from("email_connections").upsert(
      {
        garage_id: state.garageId,
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
      return errorRedirect(redirectBase, "supabase_upsert", { code: upsertError.code });
    }

    const { error: updateError } = await supabaseAdmin
      .from("garages")
      .update({ gmail_connecte: true, gmail_adresse: emailAddress })
      .eq("id", state.garageId)
      .eq("owner_user_id", state.userId);

    if (updateError) {
      return errorRedirect(redirectBase, "supabase_garage_update", { code: updateError.code });
    }

    return NextResponse.redirect(`${redirectBase}?email_connect=success`);
  } catch (err) {
    return errorRedirect(redirectBase, "exception", err instanceof Error ? err.message : err);
  }
}
