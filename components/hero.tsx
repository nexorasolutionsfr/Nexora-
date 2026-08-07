import { ArrowRight, Sparkles, Clock, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkflowGraph } from "@/components/workflow-graph"

const bullets = ["Sans engagement", "Audit offert", "Solutions sur-mesure"]

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.7 0.17 18 / 45%), oklch(0.66 0.15 285 / 20%), transparent)",
        }}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 sm:gap-12 md:py-24 lg:grid-cols-2">
        <div className="order-2 flex flex-col items-start gap-6 lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Spécialiste de l'automatisation n8n
          </span>

          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Automatisez les tâches qui{" "}
            <span className="text-primary">grignotent</span> le temps de vos équipes
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Nexora conçoit des workflows n8n sur-mesure pour les PME : vos outils communiquent
            entre eux, les tâches répétitives disparaissent, et vos équipes se concentrent sur ce
            qui compte vraiment.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button render={<a href="#contact" />} size="lg">
              Demander une démo gratuite
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button render={<a href="#cas-usage" />} size="lg" variant="outline">
              Voir des exemples
            </Button>
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-accent" />
            <span>
              En moyenne <strong className="text-foreground">12 h par semaine</strong> économisées
              par nos clients PME.
            </span>
          </div>
        </div>

        <div className="order-1 relative lg:order-2">
          <WorkflowGraph />
        </div>
      </div>
    </section>
  )
}
