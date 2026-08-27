import { NextResponse } from "next/server";
import { createGoogleOAuthState } from "@/lib/google-oauth-state";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function GET(request: Request) {
  const garageId = new URL(request.url).searchParams.get("garage_id");
  if (!garageId) {
    return NextResponse.json({ error: "garage_id manquant" }, { status: 400 });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.OAUTH_STATE_SECRET) {
    return NextResponse.json({ error: "Configuration OAuth incomplète" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Session invalide" }, { status: 401 });
  }

  const { data: garage, error: garageError } = await supabaseAdmin
    .from("garages")
    .select("id")
    .eq("id", garageId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (garageError || !garage) {
    return NextResponse.json({ error: "Garage non autorisé" }, { status: 403 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app"}/api/auth/google/callback`;
  const state = createGoogleOAuthState(garage.id, user.id);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPE,
    state,
  });

  return NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}
