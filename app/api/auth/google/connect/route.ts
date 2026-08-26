import { NextResponse } from "next/server";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function GET(request) {
  const garageId = new URL(request.url).searchParams.get("garage_id");
  if (!garageId) {
    return NextResponse.json({ error: "garage_id manquant" }, { status: 400 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app"}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPE,
    state: garageId,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
