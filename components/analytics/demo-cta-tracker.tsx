'use client'

import { useEffect } from 'react'
import { track } from '@vercel/analytics'

const DEMO_CTA_SELECTOR = 'a[href="#contact"]'

/**
 * Compte les clics sur les CTA « Demander une démo » de la vitrine par
 * délégation, depuis un seul point de montage : aucun composant existant
 * n'a besoin de devenir client, et le hero — zone LCP — ne reçoit pas de
 * JavaScript supplémentaire.
 *
 * L'événement ne porte aucune propriété : ni contenu de formulaire, ni
 * coordonnées, ni URL, ni identifiant. Il n'y a donc rien à divulguer par
 * construction. L'URL de la page reste soumise au filtre
 * `filterAnalyticsEvent`.
 */
export function DemoCtaTracker() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      if (target.closest(DEMO_CTA_SELECTOR)) {
        track('demo_cta_click')
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return null
}
