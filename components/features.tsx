import {
  Home,
  CalendarDays,
  Wrench,
  Camera,
  ClipboardList,
  Car,
  Users,
  ReceiptText,
  ListChecks,
  Link2,
} from "lucide-react"
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
    icon: CalendarDays,
    title: "Agenda et rendez-vous",
    description: "Les demandes saisies dans Nexora deviennent des dossiers clairs, puis rejoignent l'agenda du garage une fois validées.",
  },
  {
    icon: Wrench,
    title: "Atelier en direct",
    description: "Suivez la progression de chaque véhicule par étape (dépose, diagnostic, intervention, prêt) et affectez-le à un mécanicien.",
  },
  {
    icon: Camera,
    title: "Contrôle véhicule avec photos",
    description: "Les points contrôlés, les photos et la décision du client sont rattachés au dossier du véhicule.",
  },
  {
    icon: ClipboardList,
    title: "Fiche atelier et ordre de réparation",
    description: "Les travaux à réaliser sur un véhicule sont consignés dans un ordre de réparation rattaché au dossier.",
  },
  {
    icon: Car,
    title: "Dossier Véhicule 360",
    description: "Un véhicule, un dossier : rendez-vous, passages en atelier, contrôles, devis et factures réunis sur la même page.",
  },
  {
    icon: Users,
    title: "Clients",
    description: "La fiche client regroupe ses coordonnées, ses véhicules et l'historique de ce qui a été fait pour lui.",
  },
  {
    icon: ReceiptText,
    title: "Devis et factures",
    description: "Devis et factures sont générés depuis le dossier du véhicule, sans ressaisie des informations déjà présentes.",
  },
  {
    icon: Link2,
    title: "Devis partagé par lien",
    description: "Le client consulte son devis ou son contrôle via un lien sécurisé, et répond à distance — sans compte ni application à installer.",
  },
  {
    icon: ListChecks,
    title: "Cockpit Opportunités",
    description: "Une liste priorisée de ce qui attend une décision ou une relance, dérivée des données réelles du garage — jamais inventée.",
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
            Pas de promesse pour plus tard : voici les fonctions réellement présentes dans la version pilote.
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
