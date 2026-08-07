import { Users, ShoppingCart, Headphones, Receipt, Megaphone, CalendarClock } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type UseCase = {
  icon: LucideIcon
  title: string
  description: string
  metric: string
}

const useCases: UseCase[] = [
  {
    icon: Users,
    title: "Prospection & CRM",
    description:
      "Chaque nouveau lead est qualifié, enrichi et ajouté à votre CRM automatiquement, avec relances programmées.",
    metric: "0 saisie manuelle",
  },
  {
    icon: Receipt,
    title: "Facturation & compta",
    description:
      "Génération, envoi et suivi des factures, rapprochement des paiements et alertes en cas de retard.",
    metric: "-80 % d'oublis",
  },
  {
    icon: Headphones,
    title: "Support client",
    description:
      "Tri automatique des demandes, réponses aux questions courantes et escalade des cas urgents à la bonne personne.",
    metric: "Réponse en minutes",
  },
  {
    icon: ShoppingCart,
    title: "E-commerce & logistique",
    description:
      "Synchronisation des commandes, stocks et transporteurs entre vos boutiques et vos outils internes.",
    metric: "Stocks toujours à jour",
  },
  {
    icon: Megaphone,
    title: "Marketing & reporting",
    description:
      "Vos données campagnes centralisées dans un tableau de bord clair, mis à jour sans intervention.",
    metric: "Rapports automatiques",
  },
  {
    icon: CalendarClock,
    title: "RH & administratif",
    description:
      "Onboarding, demandes de congés, rappels de documents : les process internes tournent tout seuls.",
    metric: "Process fluidifiés",
  },
]

export function UseCases() {
  return (
    <section id="cas-usage" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Cas d'usage</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Des automatisations pensées pour le quotidien des PME
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Quel que soit votre métier, il existe des tâches répétitives qui coûtent du temps.
            Voici où nos clients gagnent le plus.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((uc) => {
            const Icon = uc.icon
            return (
              <article
                key={uc.title}
                className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-lg font-semibold">{uc.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{uc.description}</p>
                </div>
                <span className="mt-auto inline-flex w-fit items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground/80">
                  {uc.metric}
                </span>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
