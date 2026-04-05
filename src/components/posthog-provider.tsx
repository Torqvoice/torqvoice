// PostHog analytics — active in cloud mode and on the public demo instance.
// Self-hosted instances never load or initialize PostHog.
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

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
        capture_pageview: true,
        capture_pageleave: true,
      })
    }
  }, [enabled, posthogKey, posthogHost])

  if (!enabled || !posthogKey) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
