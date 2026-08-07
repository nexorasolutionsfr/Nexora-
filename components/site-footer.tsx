import { Workflow } from "lucide-react"

const columns = [
  {
    title: "Solutions",
    links: [
      { label: "Cas d'usage par métier", href: "#cas-usage" },
      { label: "Notre méthode", href: "#methode" },
      { label: "Demander un audit", href: "#contact" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "Tarifs", href: "#tarifs" },
      { label: "Résultats attendus", href: "#temoignages" },
      { label: "Ressources", href: "#ressources" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Nous contacter", href: "#contact" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <a href="#" className="flex items-center gap-2" aria-label="Nexora — accueil">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Workflow className="h-5 w-5" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">Nexora</span>
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Automatisations n8n sur-mesure pour les PME. On élimine les tâches répétitives, vous
              retrouvez du temps pour l'essentiel.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Nexora. Tous droits réservés.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Mentions légales
            </a>
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Confidentialité
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
