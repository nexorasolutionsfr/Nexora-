import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Votre abonnement Nexora est actif",
  description: "Votre abonnement à Nexora a bien été enregistré.",
  // Page de confirmation personnelle : elle n'a rien à faire dans un moteur
  // de recherche, et un visiteur qui y arriverait par Google n'y comprendrait
  // rien.
  robots: { index: false, follow: false },
}

// Cette page ne vérifie rien et n'écrit rien.
//
// L'accès est ouvert par le webhook Stripe (app/api/abonnement/webhook), sur un
// événement signé. Le navigateur qui revient de Stripe n'est pas une preuve de
// paiement : n'importe qui peut ouvrir cette URL. Elle se contente donc de
// dire ce qui s'est passé et de ramener le garage chez lui.
//
// Elle promettait autrefois « nous vous écrivons dans quelques minutes avec vos
// accès ». C'était vrai, et c'était le problème : il fallait un humain.
export default function MerciPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            C&apos;est enregistré
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Votre abonnement est en place. Vous n&apos;avez rien à attendre et rien à
            demander : votre atelier est ouvert, avec toutes vos données là où vous les
            avez laissées.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Le reçu arrive par e-mail de la part de Stripe. Vous pouvez arrêter à tout
            moment.
          </p>
          <Button render={<a href="/dashboard" />} nativeButton={false} size="lg" className="mt-8 h-11">
            Retourner à mon atelier
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-8 text-sm text-muted-foreground">
            Un souci ?{" "}
            <a
              href="mailto:nexorasolutions.france@gmail.com"
              className="font-medium text-primary hover:underline"
            >
              nexorasolutions.france@gmail.com
            </a>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
