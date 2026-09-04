import { Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const included = [
  "Démonstration personnalisée de Nexora avec vos cas concrets",
  "Paramétrage initial de votre garage (prestations, mécaniciens, horaires)",
  "Accompagnement à la prise en main pour vous et votre équipe",
  "Vos retours directement pris en compte dans l'évolution du produit",
]

export function PilotOffer() {
  return (
    <section id="tarifs" className="scroll-mt-20">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Offre pilote</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Un accompagnement, pas juste un abonnement
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            L'offre pilote est définie avec chaque garage selon son périmètre et le niveau
            d'accompagnement nécessaire.
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-10">
          <div className="flex flex-col gap-1.5 text-center sm:text-left">
            <h3 className="font-display text-xl font-semibold">Accompagnement pilote</h3>
            <p className="text-sm text-muted-foreground">Tarif communiqué après qualification de votre garage</p>
          </div>

          <ul className="mt-6 flex flex-col gap-3">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground/90">{item}</span>
              </li>
            ))}
          </ul>

          <Button render={<a href="#contact" />} nativeButton={false} size="lg" className="mt-8 h-11 w-full sm:w-auto">
            Demander une démo
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
