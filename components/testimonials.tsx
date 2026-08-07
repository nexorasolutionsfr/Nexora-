const stats = [
  { value: "12 h", label: "économisées / semaine en moyenne, estimation par process automatisé" },
  { value: "3 sem.", label: "délai moyen de mise en place d'une automatisation" },
]

export function Testimonials() {
  return (
    <section id="temoignages" className="scroll-mt-20 border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Ce que ça change</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Le temps que vous pouvez récupérer
          </h2>
          <p className="mt-4 text-base text-muted-foreground text-pretty">
            Nexora démarre tout juste : ces chiffres sont des estimations basées sur des cas
            d'usage similaires, pas encore des résultats clients vérifiés. On préfère être
            honnête avec vous dès le départ.
          </p>
        </div>

        <dl className="mx-auto mt-10 grid max-w-xl grid-cols-2 gap-4 rounded-2xl border border-border bg-background p-5 sm:mt-14 sm:gap-6 sm:p-8">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <dt className="font-display text-2xl font-bold text-primary sm:text-4xl">{s.value}</dt>
              <dd className="text-xs text-muted-foreground text-balance sm:text-sm">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
