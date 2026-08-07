import { Search, PencilRuler, Rocket, LifeBuoy } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Step = {
  icon: LucideIcon
  step: string
  title: string
  description: string
}

const steps: Step[] = [
  {
    icon: Search,
    step: "01",
    title: "Audit de vos process",
    description:
      "On identifie ensemble les tâches chronophages et à fort impact. Vous repartez avec une feuille de route claire.",
  },
  {
    icon: PencilRuler,
    step: "02",
    title: "Conception sur-mesure",
    description:
      "On conçoit et développe vos workflows n8n, connectés à vos outils existants, sans changer vos habitudes.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Mise en production",
    description:
      "Déploiement testé et sécurisé. Vos équipes sont formées et l'automatisation tourne dès le premier jour.",
  },
  {
    icon: LifeBuoy,
    step: "04",
    title: "Suivi & optimisation",
    description:
      "On surveille, on améliore et on fait évoluer vos automatisations au rythme de votre croissance.",
  },
]

export function HowItWorks() {
  return (
    <section id="methode" className="scroll-mt-20 border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Notre méthode</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            De l'idée à l'automatisation qui tourne, en 4 étapes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Une approche simple et transparente, pensée pour les dirigeants qui n'ont pas de temps
            à perdre.
          </p>
        </div>

        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => {
            const Icon = s.icon
            return (
              <li
                key={s.step}
                className="relative flex flex-col gap-4 rounded-2xl border border-border bg-background p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-display text-2xl font-bold text-muted-foreground/30">
                    {s.step}
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.description}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
