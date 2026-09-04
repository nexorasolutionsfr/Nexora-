import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterAnalyticsEvent } from './filter-analytics-event.ts'

const PARSE_BASE = 'https://nexora-analytics-filter.invalid'

const ALLOWED = [
  { label: 'root', url: '/', expectUrl: '/' },
  { label: 'root with utm query', url: '/?utm_source=test', expectUrl: '/' },
  {
    label: 'root with fragment',
    url: '/#section',
    expectUrl: '/',
  },
  {
    label: 'root with query and fragment combined',
    url: '/?utm_source=test&garage_id=uuid-factice#top',
    expectUrl: '/',
  },
  {
    label: 'absolute root URL',
    url: 'https://nexora-garage.vercel.app/',
    expectUrl: '/',
  },
]

const REJECTED = [
  { label: 'dashboard', url: '/dashboard' },
  { label: 'dashboard with garage_id query', url: '/dashboard?garage_id=uuid-factice' },
  { label: 'atelier token route', url: '/atelier/jeton-factice' },
  { label: 'devis token route', url: '/devis/jeton-factice' },
  { label: 'facture token route', url: '/facture/jeton-factice' },
  { label: 'inspection short link', url: '/i/jeton-factice' },
  { label: 'confirmation short link', url: '/c/jeton-factice' },
  { label: 'confirmation route', url: '/confirmation/jeton-factice' },
  { label: 'ressources slug route', url: '/ressources/slug' },
  { label: 'unknown route', url: '/une-route-inconnue' },
  { label: 'api route', url: '/api/auth/google/connect' },
  { label: 'invalid URL', url: 'not a valid url ::' },
  {
    label: 'route containing a UUID',
    url: '/atelier/550e8400-e29b-41d4-a716-446655440000',
  },
  {
    label: 'route containing an encoded email',
    url: '/confirmation/test%40example.com',
  },
  { label: 'root-looking path that is not exactly root', url: '//' },
]

test('filterAnalyticsEvent allows only the normalized root pageview', () => {
  for (const { label, url, expectUrl } of ALLOWED) {
    const result = filterAnalyticsEvent({ type: 'pageview', url })
    assert.notEqual(result, null, `expected "${label}" (${url}) to be allowed`)
    assert.equal(result?.url, expectUrl, `expected "${label}" to normalize to ${expectUrl}`)
    assert.equal(result?.type, 'pageview')
    assert.equal(result?.url.includes('?'), false, `"${label}" must not carry a query string`)
    assert.equal(result?.url.includes('#'), false, `"${label}" must not carry a fragment`)
  }
})

test('filterAnalyticsEvent rejects every non-root, dynamic, API, or invalid URL', () => {
  for (const { label, url } of REJECTED) {
    const result = filterAnalyticsEvent({ type: 'pageview', url })
    assert.equal(result, null, `expected "${label}" (${url}) to be rejected, got ${JSON.stringify(result)}`)
  }
})

test('filterAnalyticsEvent rejects custom events on non-root routes', () => {
  const result = filterAnalyticsEvent({ type: 'event', url: '/dashboard' })
  assert.equal(result, null)
})

test('filterAnalyticsEvent allows custom events on the root route, normalized', () => {
  const result = filterAnalyticsEvent({ type: 'event', url: '/?utm_source=test' })
  assert.notEqual(result, null)
  assert.equal(result?.url, '/')
  assert.equal(result?.type, 'event')
})

// --- Attribution : préservation stricte d'`utm_source` sur la racine ---

const ALLOWED_UTM_SOURCES = ['tiktok', 'instagram', 'facebook', 'linkedin']

test('filterAnalyticsEvent preserves each of the four allowed utm_source values on the root', () => {
  for (const source of ALLOWED_UTM_SOURCES) {
    const result = filterAnalyticsEvent({ type: 'pageview', url: `/?utm_source=${source}` })
    assert.notEqual(result, null, `expected utm_source=${source} to be allowed`)
    assert.equal(result?.url, `/?utm_source=${source}`)
    assert.equal(result?.type, 'pageview')
  }
})

test('filterAnalyticsEvent preserves an allowed utm_source on custom events too', () => {
  const result = filterAnalyticsEvent({ type: 'event', url: '/?utm_source=linkedin' })
  assert.equal(result?.url, '/?utm_source=linkedin')
  assert.equal(result?.type, 'event')
})

const REJECTED_UTM_VALUES = [
  { label: 'unknown network', url: '/?utm_source=twitter' },
  { label: 'unknown free-form value', url: '/?utm_source=test' },
  { label: 'uppercase variant', url: '/?utm_source=TikTok' },
  { label: 'all-caps variant', url: '/?utm_source=LINKEDIN' },
  { label: 'leading space', url: '/?utm_source=%20tiktok' },
  { label: 'trailing space', url: '/?utm_source=tiktok%20' },
  { label: 'empty value', url: '/?utm_source=' },
  { label: 'parameter present with no value', url: '/?utm_source' },
  { label: 'allowed value as a prefix', url: '/?utm_source=tiktok-ads' },
  { label: 'allowed value as a suffix', url: '/?utm_source=paid-tiktok' },
  { label: 'duplicated parameter, both allowed', url: '/?utm_source=tiktok&utm_source=linkedin' },
  { label: 'duplicated parameter, one allowed', url: '/?utm_source=tiktok&utm_source=twitter' },
  { label: 'different utm parameter only', url: '/?utm_medium=tiktok' },
  { label: 'no query at all', url: '/' },
]

test('filterAnalyticsEvent drops every utm_source value outside the allow-list', () => {
  for (const { label, url } of REJECTED_UTM_VALUES) {
    const result = filterAnalyticsEvent({ type: 'pageview', url })
    assert.notEqual(result, null, `expected "${label}" (${url}) to stay allowed as a root pageview`)
    assert.equal(result?.url, '/', `expected "${label}" (${url}) to be normalized to "/"`)
  }
})

const NOISE_ALONGSIDE_ALLOWED_SOURCE = [
  '/?utm_source=tiktok&garage_id=uuid-factice',
  '/?garage_id=uuid-factice&utm_source=tiktok',
  '/?utm_source=tiktok&email=test%40example.com',
  '/?utm_source=tiktok&token=jeton-factice',
  '/?utm_source=tiktok&utm_medium=bio&utm_campaign=lancement',
  '/?utm_source=tiktok#contact',
  '/?utm_source=tiktok&garage_id=uuid-factice#top',
  'https://nexora-garage.vercel.app/?utm_source=tiktok&token=jeton-factice',
]

test('filterAnalyticsEvent keeps only utm_source when other parameters or a fragment ride along', () => {
  for (const url of NOISE_ALONGSIDE_ALLOWED_SOURCE) {
    const result = filterAnalyticsEvent({ type: 'pageview', url })
    assert.equal(result?.url, '/?utm_source=tiktok', `expected ${url} to keep only utm_source`)
    assert.equal(result?.url.includes('#'), false, `${url} must not carry a fragment`)
  }
})

test('no query key other than utm_source ever survives the filter', () => {
  const urls = [
    ...ALLOWED_UTM_SOURCES.map((source) => `/?utm_source=${source}`),
    ...REJECTED_UTM_VALUES.map(({ url }) => url),
    ...NOISE_ALONGSIDE_ALLOWED_SOURCE,
  ]

  for (const url of urls) {
    const result = filterAnalyticsEvent({ type: 'pageview', url })
    assert.notEqual(result, null, `expected ${url} to be allowed as a root pageview`)

    const keys = [...new URL(result!.url, PARSE_BASE).searchParams.keys()]
    assert.deepEqual(keys.filter((key) => key !== 'utm_source'), [], `${url} leaked a query key`)
  }
})

// --- Forme de l'événement : les champs posés par le script Vercel survivent ---

test('filterAnalyticsEvent preserves non-sensitive event fields beyond type/url on the allowed root', () => {
  const original = {
    type: 'pageview' as const,
    url: '/?utm_source=tiktok&garage_id=uuid-factice#top',
    projectId: 'proj_factice',
    sdkn: '@vercel/analytics',
    sdkv: '1.6.1',
    ts: 1735689600000,
  }
  const result = filterAnalyticsEvent(original)
  assert.equal(result?.url, '/?utm_source=tiktok')
  assert.equal(result?.type, 'pageview')
  assert.equal(result?.projectId, 'proj_factice')
  assert.equal(result?.sdkn, '@vercel/analytics')
  assert.equal(result?.sdkv, '1.6.1')
  assert.equal(result?.ts, 1735689600000)
})

test('filterAnalyticsEvent does not mutate the original event object', () => {
  const original = { type: 'pageview' as const, url: '/?utm_source=tiktok', projectId: 'proj_factice' }
  const snapshot = { ...original }
  const result = filterAnalyticsEvent(original)
  assert.deepEqual(original, snapshot, 'the input event must be left untouched')
  assert.notEqual(result, original, 'the filter must return a new object, not the original reference')
})
