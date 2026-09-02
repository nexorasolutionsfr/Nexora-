import { SiteLogo } from "@/components/site-logo"

const columns = [
  {
    title: "Produit",
    links: [
      { label: "Fonctionnalités", href: "#produit" },
      { label: "Parcours client", href: "#parcours" },
      { label: "Sécurité", href: "#securite" },
    ],
  },
  {
    title: "Garage",
    links: [
      { label: "Espace garage", href: "/dashboard" },
      { label: "Offre pilote", href: "#tarifs" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Contact",
    links: [{ label: "Demander une démo", href: "#contact" }],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <a href="/" aria-label="Nexora Garage OS — accueil">
              <SiteLogo />
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Le système d'exploitation du garage indépendant : réception, atelier, inspections,
              devis et factures dans une seule interface.
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

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Nexora</p>
          <a href="mailto:nexorasolutions.france@gmail.com" className="text-sm text-muted-foreground hover:text-foreground">
            nexorasolutions.france@gmail.com
          </a>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground sm:text-left">
          Nexora est édité par Nexora Solutions (entreprise individuelle, France). Mentions légales
          complètes (SIREN/SIRET, adresse de domiciliation, conditions générales) en cours de
          finalisation — la publication commerciale de cette offre reste suspendue jusqu'à leur
          disponibilité.
        </p>
      </div>
    </footer>
  )
}
