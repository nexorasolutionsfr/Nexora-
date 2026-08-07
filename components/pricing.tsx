import { Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type Plan = {
  name: string
  price: string
  priceNote: string
  description: string
  features: string[]
  cta: string
  highlighted?: boolean
}

const plans: Plan[] = [
  {
    name: "Découverte",
    price: "À partir de 249 €",
    priceNote: "projet ponctuel · sans engagement · tarif de lancement",
    description: "Un premier process automatisé, pour tester sans risque. Aucun abonnement requis après.",
    features: [
      "1 workflow n8n sur-mesure",
      "Connexion à vos outils clés",
      "Audit du process concerné",
      "Formation de votre équipe",
      "30 jours de support inclus",
    ],
    cta: "Démarrer petit",
    highlighted: true,
  },
  {
    name: "Croissance",
    price: "79 €",
    priceNote: "/ mois",
    description: "Pour automatiser en continu et faire évoluer vos process, une fois le premier essai concluant.",
    features: [
      "Workflows illimités selon forfait",
      "Audit complet de vos process",
      "Maintenance & monitoring inclus",
      "Optimisations mensuelles",
      "Support sous 48 h",
    ],
    cta: "Demander un devis",
  },
  {
    name: "Sur-mesure",
    price: "Sur devis",
    priceNote: "besoins spécifiques",
    description: "Plusieurs workflows connectés entre eux, pour des process complexes impliquant plusieurs équipes.",
    features: [
      "Architecture multi-workflows",
      "Intégrations avancées & API",
      "Hébergement n8n privé",
      "Accompagnement stratégique",
    ],
    cta: "Nous contacter",
  },
]

export function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Tarifs</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Un investissement rentabilisé dès les premières semaines
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Des formules claires, adaptées à la taille de votre PME. Chaque projet démarre par un
            audit gratuit et sans engagement.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-4 sm:mt-14 sm:gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col gap-4 rounded-2xl border p-5 sm:gap-6 sm:p-7 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-[0_0_0_1px_oklch(0.7_0.17_18_/_30%),0_20px_60px_-20px_oklch(0.7_0.17_18_/_35%)]"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-5 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground sm:left-7">
                  Idéal pour démarrer
                </span>
              )}

              <div className="flex flex-col gap-1.5 sm:gap-2">
                <h3 className="font-display text-lg font-semibold sm:text-xl">{plan.name}</h3>
                <div className="flex flex-col gap-0.5">
                  <span className="whitespace-nowrap font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-sm">{plan.priceNote}</span>
                </div>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <ul className="flex flex-col gap-2 sm:gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                render={<a href="#contact" />}
                className="mt-auto"
                variant={plan.highlighted ? "default" : "outline"}
                size="lg"
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
