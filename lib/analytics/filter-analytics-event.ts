export interface AnalyticsBeforeSendEvent {
  type: 'pageview' | 'event'
  url: string
  [key: string]: unknown
}

const ALLOWED_PATHNAME = '/'
const PARSE_BASE = 'https://nexora-analytics-filter.invalid'

const UTM_SOURCE_PARAM = 'utm_source'

/**
 * Seules ces quatre valeurs d'`utm_source` survivent au filtre. La
 * comparaison est stricte : ni normalisation de casse, ni suppression
 * d'espaces, pour qu'aucune valeur façonnée par un tiers ne se glisse
 * dans les URL collectées.
 */
const ALLOWED_UTM_SOURCES = new Set(['tiktok', 'instagram', 'facebook', 'linkedin'])

/**
 * Vercel Analytics `beforeSend` filter. Closed by default: only the
 * marketing root path produces an event, stripped of its fragment and of
 * every query parameter but one. Every other route (dashboard, public
 * client links, dynamic token routes, API routes, unknown routes) and
 * every unparsable URL is rejected.
 *
 * Sur la racine, `utm_source` est conservé si — et seulement si — sa
 * valeur est exactement l'une des quatre sources autorisées. Tout le
 * reste de la query string disparaît, y compris les paramètres qui
 * accompagneraient un `utm_source` valide.
 *
 * The original event is spread (not reconstructed) so that any field the
 * Vercel script attaches beyond `type`/`url` reaches the collection
 * endpoint intact; `url` is always overwritten with the value computed
 * here.
 */
export function filterAnalyticsEvent(
  event: AnalyticsBeforeSendEvent
): AnalyticsBeforeSendEvent | null {
  let parsed: URL

  try {
    parsed = new URL(event.url, PARSE_BASE)
  } catch {
    return null
  }

  if (parsed.pathname !== ALLOWED_PATHNAME) {
    return null
  }

  return {
    ...event,
    url: ALLOWED_PATHNAME + allowedUtmSourceQuery(parsed.searchParams),
  }
}

/**
 * Rend `?utm_source=<valeur>` pour une source autorisée déclarée une
 * seule fois, et la chaîne vide dans tous les autres cas.
 */
function allowedUtmSourceQuery(searchParams: URLSearchParams): string {
  const values = searchParams.getAll(UTM_SOURCE_PARAM)

  if (values.length !== 1) {
    return ''
  }

  const [value] = values

  if (!ALLOWED_UTM_SOURCES.has(value)) {
    return ''
  }

  return `?${UTM_SOURCE_PARAM}=${value}`
}
