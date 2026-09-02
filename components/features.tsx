import { Home, Inbox, Wrench, ClipboardList, ReceiptText, ListChecks, Link2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Feature = {
  icon: LucideIcon
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: Home,
    title: "Accueil Garage OS",
    description: "Une vue du jour : rendez-vous, véhicules en atelier, priorités actives et montant connu à risque, en un coup d'œil.",
  },
  {
    icon: Inbox,
    title: "Demandes, agenda et rendez-vous",
    description: "Les demandes saisies dans Nexora sont regroupées au même endroit, puis rejoignent l'agenda une fois validées. La reprise automatique des demandes reçues par email est en cours de finalisation.",
  },
  {
    icon: Wrench,
    title: "Atelier en direct et affectation",
    description: "Suivez la progression de chaque véhicule par étape (dépose, diagnostic, intervention, prêt) et affectez-le à un mécanicien.",
  },
  {
    icon: ClipboardList,
    title: "Inspections digitales",
    description: "Photos et décisions du client sont rattachées au dossier, consultables par le garage et par le client via un lien sécurisé.",
  },
  {
    icon: ReceiptText,
    title: "Devis, factures et réponses à distance",
    description: "Devis et factures sont générés depuis le dossier, avec une réponse client possible à distance sur les devis.",
  },
  {
    icon: ListChecks,
    title: "Cockpit Opportunités",
    description: "Une liste priorisée de ce qui attend une décision ou une relance, dérivée des données réelles du garage — jamais inventée.",
  },
  {
    icon: Link2,
    title: "Liens clients temporaires et sécurisés",
    description: "Atelier, devis, facture et inspection sont partagés par jeton opaque, avec expiration et révocation possibles.",
  },
]

export function Features() {
  return (
    <section id="produit" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Fonctionnalités disponibles</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Ce que Nexora fait aujourd'hui, réellement
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Pas de promesse pour plus tard : voici les fonctions disponibles dans la version pilote.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
