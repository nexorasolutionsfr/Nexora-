import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Ouverture du portail de facturation Stripe pour le garage connecté.
//
// POURQUOI CETTE ROUTE EXISTE
//
// La page tarifaire promet « vous arrêtez vous-même, sans nous écrire ». Cette
// promesse ne tenait qu'à moitié : Stripe envoie bien un lien vers son portail
// dans ses e-mails, mais un garage qui cherche à résilier DEPUIS Nexora ne
// trouvait aucune porte. Une promesse à moitié vraie est une promesse fausse
// le jour où quelqu'un la met à l'épreuve.
//
// Sur ce portail, le garage met à jour sa carte, télécharge ses factures et
// résilie — en fin de période, jamais immédiatement, pour ne pas perdre des
// jours déjà payés. Tout est configuré côté Stripe, il n'y a rien à écrire ici.
//
// LE GARAGE EST DÉDUIT DU JETON, JAMAIS DE LA REQUÊTE
//
// Même règle que la route de paiement : un `customer` envoyé par le navigateur
// laisserait ouvrir le portail de facturation de n'importe qui — c'est-à-dire
// lire ses factures et résilier son abonnement.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app"

export async function POST(request: Request) {
  const entete = request.headers.get("authorization") || ""
  const jeton = entete.toLowerCase().startsWith("bearer ") ? entete.slice(7).trim() : ""
  if (!jeton) {
    return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 })
  }

  const supabaseUtilisateur = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jeton}` } },
    },
  )

  const { data: garage, error: erreurGarage } = await supabaseUtilisateur
    .from("garages")
    .select("id, stripe_customer_id")
    .maybeSingle()

  if (erreurGarage || !garage) {
    return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 })
  }

  // Un garage encore en essai Nexora n'a pas de client Stripe : il n'a rien à
  // gérer, et rien à résilier. On le dit plutôt que d'ouvrir une page vide.
  if (!garage.stripe_customer_id) {
    return NextResponse.json({ erreur: "aucun_abonnement" }, { status: 409 })
  }

  const cle = process.env.STRIPE_SECRET_KEY
  if (!cle) {
    return NextResponse.json({ erreur: "paiement_indisponible" }, { status: 503 })
  }

  try {
    const reponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: garage.stripe_customer_id,
        return_url: `${APP_URL}/dashboard`,
      }),
    })

    const resultat = (await reponse.json()) as { url?: string; error?: { message?: string } }
    if (!reponse.ok || !resultat.url) {
      console.error("Portail Stripe refusé :", reponse.status, resultat.error?.message)
      return NextResponse.json({ erreur: "portail_indisponible" }, { status: 502 })
    }

    return NextResponse.json({ url: resultat.url })
  } catch (erreur) {
    console.error("Portail Stripe impossible :", erreur)
    return NextResponse.json({ erreur: "portail_indisponible" }, { status: 502 })
  }
}
