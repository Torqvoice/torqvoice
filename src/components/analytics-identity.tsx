'use client'

import { useEffect } from 'react'
import { identifyUser } from '@/lib/analytics'

/**
 * Tells analytics who is signed in and which workshop they are in. Mounted
 * once in the signed-in layout; sends nothing where PostHog never starts.
 */
export function AnalyticsIdentity({
  userId,
  organizationId,
}: {
  userId: string
  organizationId: string
}) {
  useEffect(() => {
    identifyUser(userId, organizationId)
  }, [userId, organizationId])

  return null
}
