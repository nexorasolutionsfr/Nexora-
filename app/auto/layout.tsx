import type { Metadata, Viewport } from "next"

import { AccesAutoProvider } from "@/components/auto/acces"
import AutoFerme from "@/components/auto/AutoFerme"
import { accesAutoServeur } from "@/lib/auto/acces-serveur"

// Nexora Auto : l'app grand public. Pas encore ouverte au public, donc pas
// indexée tant que le lancement n'est pas décidé.
export const metadata: Metadata = {
  title: "Nexora — Votre voiture. Une seule app.",
  description: "L'historique, le kilométrage et les échéances de votre voiture, au même endroit.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#F5F7FA",
}

// Le mode d'accès se lit à chaque requête : le changer en base prend effet
// sans redéploiement.
export const dynamic = "force-dynamic"

// Fermé (par défaut, par l'interrupteur AUTO_ACCES=ferme, sur une
// prévisualisation reliée à la Production, ou base illisible) : aucun écran
// Nexora Auto n'est servi. Voir lib/auto/acces.js.
export default async function AutoLayout({ children }: { children: React.ReactNode }) {
  const acces = await accesAutoServeur()
  return (
    <div className="espace-auto min-h-dvh bg-background text-foreground">
      {acces.mode === "ferme" ? <AutoFerme /> : <AccesAutoProvider mode={acces.mode}>{children}</AccesAutoProvider>}
    </div>
  )
}
