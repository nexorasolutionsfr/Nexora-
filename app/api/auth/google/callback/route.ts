import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app";

function errorRedirect(redirectBase, step, detail) {
  console.error(`[oauth/google/callback] échec à l'étape "${step}":`, detail);
  return NextResponse.redirect(`${redirectBase}?email_connect=error&step=${step}`);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const garageId = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectBase = `${APP_URL}/dashboard`;

  if (errorParam || !code || !garageId) {
    return errorRedirect(redirectBase, "params", { errorParam, hasCode: !!code, garageId });
  }

  try {
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
      return errorRedirect(redirectBase, "token_exchange", await tokenRes.text());
    }

    const tokens = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!refresh_token) {
      return errorRedirect(redirectBase, "no_refresh_token", tokens);
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
      return errorRedirect(redirectBase, "supabase_upsert", upsertError);
    }

    const { error: updateError } = await supabaseAdmin
      .from("garages")
      .update({ gmail_connecte: true, gmail_adresse: emailAddress })
      .eq("id", garageId);

    if (updateError) {
      return errorRedirect(redirectBase, "supabase_garage_update", updateError);
    }

    return NextResponse.redirect(`${redirectBase}?email_connect=success`);
  } catch (err) {
    return errorRedirect(redirectBase, "exception", err instanceof Error ? err.message : err);
  }
}
