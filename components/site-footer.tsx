import { Workflow } from "lucide-react"

const columns = [
  {
    title: "Solutions",
    links: ["Prospection & CRM", "Facturation", "Support client", "E-commerce", "Reporting"],
  },
  {
    title: "Entreprise",
    links: ["Cas d'usage", "Méthode", "Tarifs", "Témoignages", "Ressources"],
  },
  {
    title: "Ressources",
    links: ["Blog", "Guides n8n", "Cas clients", "FAQ", "Contact"],
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
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link}
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
