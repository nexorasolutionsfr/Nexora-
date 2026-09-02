import { ShieldCheck, KeyRound, Link2, TimerOff, EyeOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Point = {
  icon: LucideIcon
  title: string
  description: string
}

const points: Point[] = [
  {
    icon: ShieldCheck,
    title: "Séparation des données par garage",
    description: "Les accès sont filtrés par garage au niveau de la base de données.",
  },
  {
    icon: KeyRound,
    title: "Accès authentifié au dashboard",
    description: "L'espace garage nécessite une authentification. Les données métier sont accessibles aux comptes autorisés du garage concerné.",
  },
  {
    icon: Link2,
    title: "Liens clients par jetons opaques",
    description: "Les liens atelier, devis, facture et inspection sont générés à partir de 256 bits aléatoires et n'exposent aucun identifiant métier dans leur URL.",
  },
  {
    icon: TimerOff,
    title: "Expiration et révocation des liens",
    description: "Chaque lien client possède une date d'expiration et peut être révoqué par le garage.",
  },
  {
    icon: EyeOff,
    title: "Aucune donnée métier dans l'URL",
    description: "L'URL ne contient ni nom de client, ni montant, ni identifiant métier lisible.",
  },
]

export function Security() {
  return (
    <section id="securite" className="scroll-mt-20 border-y border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Sécurité</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Des faits vérifiés, pas des promesses
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <p.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-base font-semibold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            La sécurité est intégrée à la conception. La conformité RGPD complète reste un chantier
            juridique et opérationnel distinct.
          </p>
        </div>
      </div>
    </section>
  )
}
