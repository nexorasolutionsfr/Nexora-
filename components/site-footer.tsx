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
              Votre garage avance, Nexora garde le fil. Agenda, atelier en direct, contrôle
              véhicule, dossier véhicule, devis et factures dans une seule interface.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="flex flex-col gap-0.5 sm:gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
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
          et politique de confidentialité en cours de finalisation. Pour toute question relative aux
          données :{" "}
          <a
            href="mailto:nexorasolutions.france@gmail.com"
            className="text-primary hover:underline"
          >
            nexorasolutions.france@gmail.com
          </a>
        </p>
      </div>
    </footer>
  )
}
