import type { Metadata, Viewport } from "next"

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

export default function AutoLayout({ children }: { children: React.ReactNode }) {
  return <div className="espace-auto min-h-dvh bg-background text-foreground">{children}</div>
}
