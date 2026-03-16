// PostHog analytics — only active in cloud mode (TORQVOICE_MODE=cloud).
// Self-hosted instances never load or initialize PostHog.
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

function PostHogInit() {
  const ph = usePostHog()

  useEffect(() => {
    if (!ph.__loaded) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        capture_pageview: true,
        capture_pageleave: true,
      })
    }
  }, [ph])

  return null
}

export function PostHogProvider({
  isCloud,
  children,
}: {
  isCloud: boolean
  children: React.ReactNode
}) {
  if (!isCloud) {
    return children
  }

  return (
    <PHProvider client={posthog}>
      <PostHogInit />
      {children}
    </PHProvider>
  )
}
