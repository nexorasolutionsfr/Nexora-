import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { JOURS_ESSAI } from "@/lib/tarifs"

export const metadata: Metadata = {
  title: "Votre essai Nexora est ouvert",
  description: "Votre essai de Nexora a bien démarré.",
  // Page de confirmation personnelle : elle n'a rien à faire dans un moteur
  // de recherche, et un visiteur qui y arriverait par Google n'y comprendrait
  // rien.
  robots: { index: false, follow: false },
}

export default function MerciPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Votre essai est ouvert
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Vous avez {JOURS_ESSAI} jours devant vous. Rien n&apos;est prélevé d&apos;ici là, et
            vous pouvez arrêter à tout moment depuis votre espace.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Nous vous écrivons dans quelques minutes avec vos accès. Si vous n&apos;avez rien reçu
            d&apos;ici une heure, écrivez-nous à{" "}
            <a
              href="mailto:nexorasolutions.france@gmail.com"
              className="font-medium text-primary hover:underline"
            >
              nexorasolutions.france@gmail.com
            </a>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
