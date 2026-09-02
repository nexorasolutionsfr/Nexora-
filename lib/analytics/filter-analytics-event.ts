export interface AnalyticsBeforeSendEvent {
  type: 'pageview' | 'event'
  url: string
  [key: string]: unknown
}

const ALLOWED_PATHNAME = '/'
const PARSE_BASE = 'https://nexora-analytics-filter.invalid'

/**
 * Vercel Analytics `beforeSend` filter. Closed by default: only the
 * marketing root path produces an event, stripped of query string and
 * fragment. Every other route (dashboard, public client links, dynamic
 * token routes, API routes, unknown routes) and every unparsable URL is
 * rejected. The original event is spread (not reconstructed) so that any
 * field the Vercel script attaches beyond `type`/`url` reaches the
 * collection endpoint intact.
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
    url: ALLOWED_PATHNAME,
  }
}
