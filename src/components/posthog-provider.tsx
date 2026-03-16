// PostHog analytics — only active in cloud mode (TORQVOICE_MODE=cloud).
// Self-hosted instances never load or initialize PostHog.
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({
  isCloud,
  posthogKey,
  posthogHost,
  children,
}: {
  isCloud: boolean
  posthogKey?: string
  posthogHost?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (isCloud && posthogKey) {
      posthog.init(posthogKey, {
        api_host: posthogHost || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
      })
    }
  }, [isCloud, posthogKey, posthogHost])

  if (!isCloud || !posthogKey) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
