import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { AnalyticsClient } from '@/components/analytics/analytics-client'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nexora — Garage OS pour garages automobiles indépendants',
  description:
    "Nexora est le Garage OS des indépendants : logiciel de gestion garage automobile qui centralise demandes, rendez-vous, atelier, inspections digitales, devis et factures dans une interface unique.",
  keywords: [
    'logiciel garage automobile',
    'gestion atelier automobile',
    'devis garage',
    'suivi véhicule',
    'Garage OS',
    'garage indépendant',
  ],
  openGraph: {
    title: 'Nexora — Garage OS pour garages automobiles indépendants',
    description:
      "Le système d'exploitation du garage indépendant : atelier, rendez-vous, inspections, devis et factures centralisés dans une seule interface.",
    type: 'website',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexora — Garage OS pour garages automobiles indépendants',
    description:
      "Le système d'exploitation du garage indépendant : atelier, rendez-vous, inspections, devis et factures centralisés dans une seule interface.",
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#0F1B33',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={`bg-background ${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <AnalyticsClient />}
      </body>
    </html>
  )
}
