import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { Problems } from "@/components/problems"
import { DayWithNexora } from "@/components/day-with-nexora"
import { Features } from "@/components/features"
import { Security } from "@/components/security"
import { Tarifs } from "@/components/tarifs"
import { Faq } from "@/components/faq"
import { ContactCta } from "@/components/contact-cta"
import { SiteFooter } from "@/components/site-footer"
import { DemoCtaTracker } from "@/components/analytics/demo-cta-tracker"

// Données structurées volontairement minimales : uniquement des faits vérifiables
// (nom, nature du logiciel, langue). Aucun avis, aucun tarif.
const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Nexora",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "fr-FR",
  description:
    "Logiciel français pour garages automobiles indépendants : agenda, atelier en direct, contrôle véhicule avec photos, dossier véhicule, clients, devis et factures.",
}

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <DemoCtaTracker />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Problems />
        <DayWithNexora />
        <Features />
        <Security />
        <Tarifs />
        <Faq />
        <ContactCta />
      </main>
      <SiteFooter />
    </div>
  )
}
