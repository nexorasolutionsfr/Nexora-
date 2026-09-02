import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { Problems } from "@/components/problems"
import { DayWithNexora } from "@/components/day-with-nexora"
import { Features } from "@/components/features"
import { Security } from "@/components/security"
import { PilotOffer } from "@/components/pilot-offer"
import { Faq } from "@/components/faq"
import { ContactCta } from "@/components/contact-cta"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Problems />
        <DayWithNexora />
        <Features />
        <Security />
        <PilotOffer />
        <Faq />
        <ContactCta />
      </main>
      <SiteFooter />
    </div>
  )
}
