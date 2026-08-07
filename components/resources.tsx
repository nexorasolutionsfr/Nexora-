import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

type Article = {
  slug: string
  category: string
  title: string
  excerpt: string
  readTime: string
}

const articles: Article[] = [
  {
    slug: "5-taches-automatiser-pme",
    category: "Guide",
    title: "5 tâches que toute PME devrait automatiser en premier",
    excerpt: "Les automatisations les plus utiles pour démarrer, avec des exemples concrets par métier.",
    readTime: "6 min",
  },
  {
    slug: "ne-plus-rater-demande-devis-email",
    category: "Cas pratique",
    title: "Comment ne plus rater aucune demande de devis par email",
    excerpt: "Tri et priorisation automatique des demandes clients, sans changer vos outils actuels.",
    readTime: "5 min",
  },
  {
    slug: "pme-facturation-temps-divise-par-5",
    category: "Cas d'usage",
    title: "Comment une PME peut diviser son temps de facturation par 5",
    excerpt: "Exemple concret d'automatisation de la facturation, étape par étape.",
    readTime: "5 min",
  },
]

export function Resources() {
  return (
    <section id="ressources" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Ressources</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Apprenez à automatiser votre PME
            </h2>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Guides pratiques, comparatifs et retours d'expérience pour passer à l'action.
            </p>
          </div>
          <a
            href="#contact"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Discutons de votre projet
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.title}
              href={`/ressources/${a.slug}`}
              className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground/80">
                  {a.category}
                </span>
                <span className="text-xs text-muted-foreground">{a.readTime} de lecture</span>
              </div>
              <h3 className="font-display text-lg font-semibold leading-snug text-balance transition-colors group-hover:text-primary">
                {a.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{a.excerpt}</p>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Lire l'article
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
