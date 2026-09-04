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

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nexora-garage.vercel.app'

const SITE_TITLE = 'Nexora — Garage OS pour garages automobiles indépendants'
const SITE_DESCRIPTION =
  "Votre garage avance, Nexora garde le fil. Le logiciel français qui réunit agenda, atelier en direct, contrôle véhicule, dossier véhicule, devis et factures pour les garages indépendants."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: 'Nexora',
  alternates: {
    canonical: '/',
  },
  keywords: [
    'logiciel garage automobile',
    'gestion atelier automobile',
    'devis garage',
    'suivi véhicule',
    'Garage OS',
    'garage indépendant',
  ],
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: 'Nexora',
    type: 'website',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
