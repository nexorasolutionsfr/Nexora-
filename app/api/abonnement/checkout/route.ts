import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { offre, prix, type Periodicite } from "@/lib/tarifs"

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
// IL FAUT ÊTRE CONNECTÉ, ET C'EST LE POINT DE DÉPART DE TOUT LE RESTE
//
// Cette route exigeait autrefois zéro authentification : la page tarifaire
// publique l'appelait, et la session Stripe ne portait aucune trace du garage.
// Un paiement réussi n'avait alors personne à qui être rattaché — c'est-à-dire
// qu'il fallait un humain pour ouvrir l'accès à la main. Désormais la session
// porte `client_reference_id`, et la même valeur en métadonnée d'abonnement
// pour que TOUS les événements ultérieurs (renouvellement, échec de paiement,
// résiliation) sachent de quel garage ils parlent.
//
// Le garage n'est jamais lu depuis la requête : il est déduit du jeton. Un
// `garage_id` envoyé par le navigateur laisserait payer pour le compte d'un
// autre — ou pire, faire payer un autre.
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

// Stripe refuse une fin d'essai à moins de 48 heures. En deçà, on n'en met
// aucune : le garage est facturé tout de suite, ce qui est exactement ce
// qu'il demande en s'abonnant à la veille de la fin de son essai.
const DELAI_MINIMAL_ESSAI_MS = 48 * 3600 * 1000

export async function POST(request: Request) {
  const entete = request.headers.get("authorization") || ""
  const jeton = entete.toLowerCase().startsWith("bearer ") ? entete.slice(7).trim() : ""
  if (!jeton) {
    return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 })
  }

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

  // Client porteur du jeton de l'appelant, avec la clé anonyme : les policies
  // s'appliquent normalement, donc `garages` ne renvoie que le garage de ce
  // compte. Pas de clé de service ici — elle contournerait précisément la
  // vérification qui nous intéresse.
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
    .select("id, email, acces_fin, stripe_customer_id")
    .maybeSingle()

  if (erreurGarage) {
    console.error("[abonnement/checkout] lecture du garage impossible :", erreurGarage.message)
    return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 })
  }
  if (!garage) {
    // Compte créé mais mise en service pas terminée : il n'y a pas encore de
    // garage à abonner.
    return NextResponse.json({ erreur: "garage_absent" }, { status: 409 })
  }

  // L'état du paiement ne se dit qu'à quelqu'un dont on a établi l'identité.
  // Placé plus haut, ce test répondait « paiement indisponible » à un jeton
  // invalide — une réponse fausse, et une information gratuite donnée à qui
  // n'est pas connecté.
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
    // Le garage doit pouvoir arrêter sans écrire à personne. Sans cette ligne,
    // un essai non voulu se transforme en litige.
    "subscription_data[trial_settings][end_behavior][missing_payment_method]": "cancel",
    // Ces trois métadonnées voyagent avec l'ABONNEMENT, donc avec chacun de ses
    // événements futurs. C'est ce qui permet à un « paiement échoué » reçu dans
    // six mois de savoir quel garage il concerne.
    "subscription_data[metadata][garage_id]": garage.id,
    "subscription_data[metadata][offre]": choisie.cle,
    "subscription_data[metadata][periodicite]": periodicite,
    // Et les mêmes sur la session, que `checkout.session.completed` transporte.
    client_reference_id: garage.id,
    "metadata[garage_id]": garage.id,
    "metadata[offre]": choisie.cle,
    "metadata[periodicite]": periodicite,
    locale: "fr",
    allow_promotion_codes: "true",
    billing_address_collection: "required",
    success_url: `${APP_URL}/abonnement/merci?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/dashboard`,
  })

  // L'accès est déjà ouvert côté Nexora. Le prolonger de quatorze jours de
  // plus parce que le garage s'abonne au troisième jour offrirait un mois ; le
  // supprimer lui ferait perdre les onze jours qui lui restent. On aligne donc
  // Stripe sur `acces_fin`, la date qui fait autorité — essai ou mois offert,
  // le garage ne perd jamais ce qu'on lui a promis en payant plus tôt.
  const finEssai = garage.acces_fin ? new Date(garage.acces_fin).getTime() : 0
  if (finEssai - Date.now() > DELAI_MINIMAL_ESSAI_MS) {
    parametres.set("subscription_data[trial_end]", String(Math.floor(finEssai / 1000)))
  }

  // Réutiliser le client Stripe existant évite d'en créer un deuxième au
  // moindre changement d'offre, et garde un seul historique de facturation.
  if (garage.stripe_customer_id) {
    parametres.set("customer", garage.stripe_customer_id)
  } else if (garage.email) {
    parametres.set("customer_email", garage.email)
  }

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
