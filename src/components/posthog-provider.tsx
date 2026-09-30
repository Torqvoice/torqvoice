// PostHog analytics — active in cloud mode and on the public demo instance.
// Self-hosted instances never load or initialize PostHog.
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { analyticsStarted } from '@/lib/analytics'

export function PostHogProvider({
  enabled,
  posthogKey,
  posthogHost,
  children,
}: {
  enabled: boolean
  posthogKey?: string
  posthogHost?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (enabled && posthogKey) {
      posthog.init(posthogKey, {
        api_host: posthogHost || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: 'history_change',
        capture_pageleave: true,
      })
      // Events fired before this effect ran (a page's own mount effects run
      // first) were held; send them now.
      analyticsStarted()
    }
  }, [enabled, posthogKey, posthogHost])

  if (!enabled || !posthogKey) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
