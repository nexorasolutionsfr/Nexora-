export interface AnalyticsBeforeSendEvent {
  type: 'pageview' | 'event'
  url: string
}

const ALLOWED_PATHNAME = '/'
const PARSE_BASE = 'https://nexora-analytics-filter.invalid'

/**
 * Vercel Analytics `beforeSend` filter. Closed by default: only the
 * marketing root path produces an event, stripped of query string and
 * fragment. Every other route (dashboard, public client links, dynamic
 * token routes, API routes, unknown routes) and every unparsable URL is
 * rejected.
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
    type: event.type,
    url: ALLOWED_PATHNAME,
  }
}
