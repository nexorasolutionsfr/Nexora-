import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { ErreurWebhook, ecritureDepuisEvenement, verifierSignature } from "@/lib/stripe/webhook"

// Réception des événements d'abonnement Stripe.
//
// C'est ici que l'essai se transforme en client payant. Sans cette route,
// `garages.abonnement_actif` reste faux quoi qu'il arrive : quelqu'un peut
// payer et rester à la porte.
//
// LE CORPS DOIT RESTER BRUT
//
// La signature porte sur les octets reçus. `request.json()` les reformate — un
// espace, un ordre de clés — et la signature ne correspond plus. On lit donc
// `request.text()` d'abord, on vérifie, puis seulement on analyse.

// node:crypto n'existe pas dans le runtime Edge, et la vérification de
// signature en dépend.
export const runtime = "nodejs"
// Un webhook ne se met pas en cache.
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    // Volontairement 503 et pas 200 : Stripe rejouera l'événement une fois la
    // clé posée, au lieu de le considérer comme traité et de le perdre.
    console.error("[abonnement/webhook] STRIPE_WEBHOOK_SECRET absent")
    return NextResponse.json({ erreur: "webhook_non_configure" }, { status: 503 })
  }

  const corpsBrut = await request.text()
  const entete = request.headers.get("stripe-signature")

  try {
    verifierSignature(corpsBrut, entete ?? "", secret)
  } catch (erreur) {
    const code = erreur instanceof ErreurWebhook ? erreur.code : "signature_refusee"
    // Pas de détail dans la réponse : elle est publique, et dire pourquoi une
    // signature échoue aide celui qui essaie d'en fabriquer une.
    console.warn("[abonnement/webhook] signature refusée :", code)
    return NextResponse.json({ erreur: "signature_refusee" }, { status: 400 })
  }

  let evenement: Record<string, unknown>
  try {
    evenement = JSON.parse(corpsBrut)
  } catch {
    return NextResponse.json({ erreur: "corps_illisible" }, { status: 400 })
  }

  let ecriture
  try {
    ecriture = ecritureDepuisEvenement(evenement)
  } catch (erreur) {
    const code = erreur instanceof ErreurWebhook ? erreur.code : "evenement_refuse"
    // 200 et pas 400 : rejouer cet événement donnerait exactement le même
    // résultat. On l'accuse pour que Stripe cesse, et on le trace pour qu'un
    // humain le voie.
    console.error("[abonnement/webhook] événement inexploitable :", code, evenement.id)
    return NextResponse.json({ ignore: code })
  }

  if (!ecriture) {
    return NextResponse.json({ ignore: "hors_sujet" })
  }

  const { cible, champs, evenementLe, ecraserLesNuls } = ecriture
  const aEcrire: Record<string, unknown> = { abonnement_maj_le: evenementLe.toISOString() }
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur === null && !ecraserLesNuls) continue
    aEcrire[cle] = valeur
  }

  // Le filtre sur `abonnement_maj_le` fait toute la protection contre le
  // désordre : Stripe ne garantit pas l'ordre de livraison, et rejoue ses
  // événements. Un « abonnement annulé » du mois dernier arrivant après un
  // « abonnement actif » d'aujourd'hui refermerait un compte payant. Le filtre
  // est dans la requête, pas dans une lecture préalable : deux événements
  // livrés en parallèle ne peuvent donc pas se doubler.
  const { data, error } = await supabaseAdmin
    .from("garages")
    .update(aEcrire)
    .eq(cible.colonne, cible.valeur)
    .or(`abonnement_maj_le.is.null,abonnement_maj_le.lt.${evenementLe.toISOString()}`)
    .select("id")

  if (error) {
    // 500 : Stripe rejouera. Une panne de base ne doit pas faire perdre un
    // paiement.
    console.error("[abonnement/webhook] écriture impossible :", error.message)
    return NextResponse.json({ erreur: "ecriture_impossible" }, { status: 500 })
  }

  if (!data || data.length === 0) {
    // Deux causes possibles, qu'on distingue pour la trace : un événement plus
    // ancien que le dernier appliqué (normal, rien à faire), ou un abonnement
    // Stripe qui ne correspond à aucun garage (anormal, à regarder).
    const { count } = await supabaseAdmin
      .from("garages")
      .select("id", { count: "exact", head: true })
      .eq(cible.colonne, cible.valeur)

    if (!count) {
      console.error(
        "[abonnement/webhook] aucun garage pour",
        cible.colonne, "=", cible.valeur, "· événement", evenement.id,
      )
      return NextResponse.json({ ignore: "garage_introuvable" })
    }
    return NextResponse.json({ ignore: "evenement_depasse" })
  }

  return NextResponse.json({ applique: data[0].id })
}
