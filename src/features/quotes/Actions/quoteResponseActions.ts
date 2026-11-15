'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { recordQuoteResponse } from '@/features/quotes/Lib/recordQuoteResponse'
import { z } from 'zod'

const respondToQuoteSchema = z.object({
  quoteId: z.string().min(1),
  publicToken: z.string().min(1),
  action: z.enum(['accepted', 'changes_requested']),
  message: z.string().optional(),
})

/** The statuses a shared quote can be answered from. */
const ANSWERABLE_FROM: readonly string[] = ['draft', 'sent']

/**
 * Public action — no auth required.
 * Customer accepts or requests changes on a shared quote page.
 */
export async function respondToQuote(input: unknown) {
  const data = respondToQuoteSchema.parse(input)

  // Verify the quote exists and the token matches
  const quote = await db.quote.findFirst({
    where: { id: data.quoteId, publicToken: data.publicToken },
    include: { customer: { select: { name: true } } },
  })
  if (!quote) {
    return { success: false, error: 'Quote not found' }
  }

  // Only allow response on quotes that are draft or sent
  if (!ANSWERABLE_FROM.includes(quote.status)) {
    return { success: false, error: 'This quote can no longer be updated' }
  }

  // Shared with the customer portal, which finds the quote by who is signed in.
  // The write checks the status again, in the same statement: a quote the
  // workshop converted since the read above, or answered in another tab, is
  // left as it is.
  const recorded = await recordQuoteResponse(quote, data.action, data.message, {
    from: ANSWERABLE_FROM,
  })
  if (!recorded) return { success: false, error: 'This quote can no longer be updated' }

  return { success: true }
}

/**
 * Authenticated — fetch quotes with customer responses (accepted / changes_requested).
 */
export async function getQuoteResponses() {
  return withAuth(
    async ({ organizationId }) => {
      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          status: { in: ['accepted', 'changes_requested'] },
          // A dismissed acceptance keeps its status, so it is left out here.
          responseDismissedAt: null,
        },
        select: {
          id: true,
          title: true,
          quoteNumber: true,
          status: true,
          customerMessage: true,
          totalAmount: true,
          updatedAt: true,
          vehicleId: true,
          customer: {
            select: { name: true },
          },
          vehicle: {
            select: { id: true, make: true, model: true, year: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      })
      return quotes
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] }
  )
}

/**
 * Authenticated — the workshop has dealt with a customer's response.
 *
 * A change request sends the quote back to draft, because the workshop is
 * revising it. An acceptance keeps its status: it is the customer's agreement,
 * converting still wants it, and where accepted quotes lock, changing it here
 * would release the lock without an owner or admin. It is only taken off the
 * list of responses.
 */
export async function acknowledgeQuoteResponse(quoteId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
      })
      if (!quote) throw new Error('Quote not found')

      const revising = quote.status === 'changes_requested'
      await db.quote.update({
        where: { id: quoteId },
        data: revising
          ? { status: 'draft', customerMessage: null }
          : { responseDismissedAt: new Date() },
      })

      // The dashboard lists responses from its own server render, so without
      // this a dismissed row stays on screen until the page is reloaded.
      revalidatePath('/')
      revalidatePath('/quotes')
      revalidatePath(`/quotes/${quoteId}`)
      return { success: true, status: revising ? 'draft' : quote.status }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
    }
  )
}
