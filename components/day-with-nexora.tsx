import { Inbox, CalendarCheck, Wrench, Link2, ListChecks, ReceiptText } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Step = {
  icon: LucideIcon
  step: string
  title: string
  description: string
}

const steps: Step[] = [
  {
    icon: Inbox,
    step: "01",
    title: "Une demande devient exploitable",
    description: "Une demande de rendez-vous est enregistrée dans Nexora et devient un dossier clair, avec les informations nécessaires pour y répondre.",
  },
  {
    icon: CalendarCheck,
    step: "02",
    title: "Le rendez-vous rejoint l'agenda",
    description: "Une fois validé, le rendez-vous apparaît dans l'agenda du garage, visible par toute l'équipe.",
  },
  {
    icon: Wrench,
    step: "03",
    title: "Le véhicule progresse dans l'atelier",
    description: "Dépose, diagnostic, intervention, prêt : chaque étape est visible en direct, sans avoir à demander au mécanicien.",
  },
  {
    icon: Link2,
    step: "04",
    title: "Le client consulte via un lien sécurisé",
    description: "Inspection ou devis : le client accède aux informations le concernant via un lien temporaire, sans compte à créer.",
  },
  {
    icon: ListChecks,
    step: "05",
    title: "Le garage retrouve ce qui compte",
    description: "Le Cockpit Opportunités rassemble ce qui attend une décision ou une relance, priorisé à partir des données réelles du garage.",
  },
  {
    icon: ReceiptText,
    step: "06",
    title: "La facture et l'historique restent centralisés",
    description: "Une fois le véhicule restitué, la facture et l'historique du dossier restent accessibles depuis le même endroit.",
  },
]

export function DayWithNexora() {
  return (
    <section id="parcours" className="scroll-mt-20 border-y border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Parcours client</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Une journée avec Nexora
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Du premier contact à la facture, voici comment un dossier circule dans Nexora.
          </p>
        </div>

        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.step}
              className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-2xl font-bold text-muted-foreground/30">{s.step}</span>
              </div>
              <h3 className="font-display text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
