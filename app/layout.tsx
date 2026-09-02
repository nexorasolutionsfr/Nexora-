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
  title: 'Nexora — Automatisations n8n sur-mesure pour PME',
  description:
    "Nexora conçoit des automatisations n8n sur-mesure qui font gagner des heures à vos équipes. Connectez vos outils, éliminez les tâches manuelles et boostez votre PME. Demandez votre démo gratuite.",
  keywords: [
    'automatisation n8n',
    'automatisation PME',
    'workflow n8n',
    'intégration logicielle',
    'gain de productivité',
    'automatisation sur-mesure',
  ],
  openGraph: {
    title: 'Nexora — Automatisations n8n sur-mesure pour PME',
    description:
      "Éliminez les tâches manuelles répétitives. Nexora automatise vos process métier avec n8n. Démo gratuite pour les PME.",
    type: 'website',
    locale: 'fr_FR',
  },
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#14161f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={`dark bg-background ${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <AnalyticsClient />}
      </body>
    </html>
  )
}
