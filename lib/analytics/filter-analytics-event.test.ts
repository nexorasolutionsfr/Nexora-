import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterAnalyticsEvent } from './filter-analytics-event.ts'

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

test('filterAnalyticsEvent preserves non-sensitive event fields beyond type/url on the allowed root', () => {
  const original = {
    type: 'pageview' as const,
    url: '/?utm_source=test#top',
    projectId: 'proj_factice',
    sdkn: '@vercel/analytics',
    sdkv: '1.6.1',
    ts: 1735689600000,
  }
  const result = filterAnalyticsEvent(original)
  assert.notEqual(result, null)
  assert.equal(result?.url, '/')
  assert.equal(result?.type, 'pageview')
  assert.equal(result?.projectId, 'proj_factice')
  assert.equal(result?.sdkn, '@vercel/analytics')
  assert.equal(result?.sdkv, '1.6.1')
  assert.equal(result?.ts, 1735689600000)
})

test('filterAnalyticsEvent does not mutate the original event object', () => {
  const original = { type: 'pageview' as const, url: '/?utm_source=test', projectId: 'proj_factice' }
  const snapshot = { ...original }
  const result = filterAnalyticsEvent(original)
  assert.deepEqual(original, snapshot, 'the input event must be left untouched')
  assert.notEqual(result, original, 'the filter must return a new object, not the original reference')
})
