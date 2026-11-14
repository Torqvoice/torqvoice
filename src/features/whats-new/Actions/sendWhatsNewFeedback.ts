'use server'

import { createHmac } from 'node:crypto'
import { getLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { isCloudMode } from '@/lib/features'
import { torqvoiceComUrl } from '@/lib/torqvoice-com'
import { withAuth } from '@/lib/with-auth'
import { whatsNewFeedbackSchema } from '../Schema/whatsNewSchema'

/**
 * A stable, meaningless name for this person on torqvoice.com, so a second
 * vote on the same entry replaces the first instead of counting twice. Keyed
 * with this install's own secret: the site can tell two votes are from one
 * person and nothing else about them.
 */
function voterKey(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('No signing secret configured: set BETTER_AUTH_SECRET.')
  return createHmac('sha256', secret).update(`whats-new:${userId}`).digest('hex')
}

/**
 * Sends a thumbs up or down on a highlight, with an optional comment, to the
 * people who wrote it.
 *
 * What leaves the building: the vote, the comment, the app version and the
 * language. A thumb on its own names nobody. A comment written on Torqvoice
 * Cloud takes the workshop's name and the sender's email along, so a "this
 * did not work" can be answered; the line under the comment box says so
 * before Send is pressed. A self-hosted install never sends either.
 */
export async function sendWhatsNewFeedback(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      demoGuard()
      const data = whatsNewFeedbackSchema.parse(input)
      const cloud = isCloudMode()

      const identity =
        cloud && data.comment
          ? await Promise.all([
              db.user.findUnique({ where: { id: userId }, select: { email: true } }),
              db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
            ])
          : null

      const response = await fetch(`${torqvoiceComUrl()}/api/app/whats-new/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          entryId: data.entryId,
          voterKey: voterKey(userId),
          vote: data.vote,
          comment: data.comment || undefined,
          appVersion: (process.env.APP_VERSION || 'development').slice(0, 64),
          mode: cloud ? 'cloud' : 'self-hosted',
          locale: await getLocale(),
          email: identity?.[0]?.email || undefined,
          workshop: identity?.[1]?.name?.slice(0, 200) || undefined,
        }),
      })
      if (!response.ok) throw new Error(`Feedback was not accepted (${response.status}).`)
      return { sent: true }
    },
    { allowDuringRestore: true }
  )
}
