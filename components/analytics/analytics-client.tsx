'use client'

import { Analytics } from '@vercel/analytics/next'
import { filterAnalyticsEvent } from '@/lib/analytics/filter-analytics-event'

export function AnalyticsClient() {
  return <Analytics beforeSend={filterAnalyticsEvent} />
}
