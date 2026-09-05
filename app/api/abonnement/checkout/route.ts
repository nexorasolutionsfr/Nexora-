import { NextResponse } from "next/server"
import { JOURS_ESSAI, offre, prix, type Periodicite } from "@/lib/tarifs"

// Ouverture d'une session de paiement Stripe pour l'abonnement à Nexora.
//
// DEUX COMPTES STRIPE À NE PAS CONFONDRE
//
// `set_stripe_secret_key` existe déjà en base : c'est la clé du GARAGE, pour
// qu'il encaisse SES clients. Cette route-ci concerne l'abonnement du garage à
// Nexora, encaissé par l'éditeur, avec SA propre clé. Les deux ne doivent
// jamais se croiser : `STRIPE_SECRET_KEY` n'est lue que côté serveur, ici, et
// n'est jamais rapprochée de `garages_secrets`.
//
// LE PRIX EST FIXÉ ICI, JAMAIS PAR L'APPELANT
//
// La requête n'envoie qu'une clé d'offre et une périodicité. Le montant est
// relu dans lib/tarifs.ts, côté serveur. Accepter un prix venu du navigateur
// laisserait n'importe qui s'abonner à un euro.
//
// La TVA n'est pas ajoutée : l'éditeur est en franchise en base (article 293 B
// du CGI). Le montant facturé est le montant affiché.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexora-garage.vercel.app"

export async function POST(request: Request) {
  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return NextResponse.json({ erreur: "requete_illisible" }, { status: 400 })
  }

  const donnees = corps as Record<string, unknown>
  const choisie = offre(typeof donnees.offre === "string" ? donnees.offre : "")
  const periodicite: Periodicite = donnees.periodicite === "annuel" ? "annuel" : "mensuel"

  if (!choisie) {
    return NextResponse.json({ erreur: "offre_inconnue" }, { status: 400 })
  }

  const cle = process.env.STRIPE_SECRET_KEY
  if (!cle) {
    // La page tarifaire est en ligne avant que le paiement ne le soit. On le
    // dit franchement plutôt que d'afficher un bouton qui ne fait rien :
    // l'interface bascule alors sur la demande de démo.
    return NextResponse.json({ erreur: "paiement_indisponible" }, { status: 503 })
  }

  const montantCentimes = prix(choisie, periodicite) * 100
  const intervalle = periodicite === "annuel" ? "year" : "month"

  // API Stripe appelée directement en HTTP : une dépendance de moins pour un
  // seul appel, et le format `application/x-www-form-urlencoded` est celui que
  // Stripe attend nativement.
  const parametres = new URLSearchParams({
    mode: "subscription",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(montantCentimes),
    "line_items[0][price_data][recurring][interval]": intervalle,
    "line_items[0][price_data][product_data][name]": `Nexora ${choisie.nom}`,
    "line_items[0][price_data][product_data][description]": choisie.pour,
    "subscription_data[trial_period_days]": String(JOURS_ESSAI),
    // Le garage doit pouvoir arrêter sans écrire à personne. Sans cette ligne,
    // un essai non voulu se transforme en litige.
    "subscription_data[trial_settings][end_behavior][missing_payment_method]": "cancel",
    "subscription_data[metadata][offre]": choisie.cle,
    "subscription_data[metadata][periodicite]": periodicite,
    locale: "fr",
    allow_promotion_codes: "true",
    billing_address_collection: "required",
    success_url: `${APP_URL}/abonnement/merci?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/#tarifs`,
  })

  try {
    const reponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parametres,
    })

    const resultat = (await reponse.json()) as { url?: string; error?: { message?: string } }
    if (!reponse.ok || !resultat.url) {
      console.error("Stripe a refusé la session :", reponse.status, resultat.error?.message)
      return NextResponse.json({ erreur: "paiement_refuse" }, { status: 502 })
    }

    return NextResponse.json({ url: resultat.url })
  } catch (erreur) {
    console.error("Session Stripe impossible :", erreur)
    return NextResponse.json({ erreur: "paiement_impossible" }, { status: 502 })
  }
}
