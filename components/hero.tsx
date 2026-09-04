import { ArrowRight, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DashboardPreview } from "@/components/dashboard-preview"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0F1B33]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #3D6BE0, transparent)" }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-16 md:py-24 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-5 sm:gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-[#B7C4E6]">
            <Wrench className="h-3.5 w-3.5 text-[#7FA0F5]" />
            Le Garage OS des indépendants
          </span>

          <h1 className="font-display text-[2rem] font-bold leading-[1.08] tracking-tight text-balance text-white sm:text-5xl lg:text-[3.4rem]">
            Votre garage avance. <span className="text-[#7FA0F5]">Nexora garde le fil.</span>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-[#B7C4E6] text-pretty sm:text-lg">
            « Vous en êtes où avec ma voiture ? » Agenda, atelier en direct, contrôle véhicule,
            devis et factures au même endroit : la réponse est toujours à portée de main.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              render={<a href="#contact" />}
              nativeButton={false}
              size="lg"
              className="h-12 w-full sm:h-11 sm:w-auto"
            >
              Demander une démo
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              render={<a href="#parcours" />}
              nativeButton={false}
              size="lg"
              variant="outline"
              className="h-12 w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:h-11 sm:w-auto dark:bg-transparent"
            >
              Voir comment ça fonctionne
            </Button>
          </div>

          <p className="text-sm text-[#B7C4E6]">
            Logiciel français. Version pilote fonctionnelle : nous constituons actuellement notre
            premier cercle de garages pilotes.
          </p>
        </div>

        <div className="relative">
          <DashboardPreview />
        </div>
      </div>
    </section>
  )
}
