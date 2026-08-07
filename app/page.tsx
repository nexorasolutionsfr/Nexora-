import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { TrustedBy } from "@/components/trusted-by"
import { UseCases } from "@/components/use-cases"
import { HowItWorks } from "@/components/how-it-works"
import { Pricing } from "@/components/pricing"
import { Testimonials } from "@/components/testimonials"
import { Resources } from "@/components/resources"
import { Faq } from "@/components/faq"
import { ContactCta } from "@/components/contact-cta"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TrustedBy />
        <UseCases />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <Resources />
        <Faq />
        <ContactCta />
      </main>
      <SiteFooter />
    </div>
  )
}
