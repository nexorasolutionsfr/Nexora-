import { NextResponse } from "next/server";

// SÉCURITÉ (audit 2026-09-01) : cette route acceptait un `garage_id` fourni
// par l'appelant dans la query string et le recopiait tel quel dans `state`
// OAuth, sans jamais vérifier que l'appelant est authentifié comme
// propriétaire de ce garage. Un tiers maîtrisant son propre flux Google
// aurait pu connecter sa boîte Gmail au compte d'un garage qui n'est pas le
// sien (voir callback/route.ts, qui écrivait ensuite en confiance totale du
// `state`). Désactivée temporairement, sans redirection vers Google, en
// attendant un `state` signé et lié à la session côté serveur.
// Pour réactiver : restaurer la redirection vers
// https://accounts.google.com/o/oauth2/v2/auth après avoir ajouté la
// vérification de session + garage_id, et un state anti-rejeu.
export async function GET() {
  return NextResponse.json(
    {
      error: "gmail_connect_disabled",
      message:
        "La connexion Gmail est temporairement indisponible le temps de corriger une faille de sécurité (autorisation du garage non vérifiée).",
    },
    { status: 503 }
  );
}
