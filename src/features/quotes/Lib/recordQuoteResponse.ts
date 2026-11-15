import { assertNotRestoring } from '@/lib/backup/freeze'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

export type QuoteAnswer = 'accepted' | 'changes_requested'

/** What recording an answer needs of the quote; each caller finds it its own way. */
export interface AnswerableQuote {
  id: string
  organizationId: string | null
  quoteNumber: string | null
  title: string
  customer: { name: string } | null
}

/**
 * A customer's answer to a quote, written down and passed on to the workshop.
 * The one place this happens: the shared link finds the quote by its token,
 * the customer portal by the signed-in customer, and both end here, so an
 * answer means the same thing whichever door it came through.
 *
 * The caller has already decided this customer may answer this quote, from a
 * read made a moment ago. That read is not what the write trusts: the quote
 * is answered in one conditional update, only while it still has one of the
 * statuses an answer may come from (`from`). If the workshop converted it in
 * between, or the same customer answered twice at once, no row matches,
 * nothing is written, nobody is told, and the answer is `false`. So a quote
 * is answered once, and "converted" is never written over with "accepted".
 *
 * Not a server action, and never exported from a 'use server' file: it trusts
 * the quote it is handed.
 */
export async function recordQuoteResponse(
  quote: AnswerableQuote,
  answer: QuoteAnswer,
  message: string | null | undefined,
  options: { from: readonly string[] }
): Promise<boolean> {
  // Neither caller goes through withAuth, so the restore freeze is checked here.
  if (quote.organizationId) assertNotRestoring(quote.organizationId)

  const { count } = await db.quote.updateMany({
    where: {
      id: quote.id,
      // The workshop the caller found the quote in, when it has one.
      ...(quote.organizationId ? { organizationId: quote.organizationId } : {}),
      status: { in: [...options.from] },
    },
    data: {
      status: answer,
      customerMessage: message || null,
      // A new answer is news again, even on a quote whose last one was dismissed.
      responseDismissedAt: null,
    },
  })
  // Someone else moved the quote first: this answer did not happen.
  if (count === 0) return false

  if (quote.organizationId) {
    const customerName = quote.customer?.name || 'A customer'
    const actionLabel = answer === 'accepted' ? 'accepted' : 'requested changes on'
    notify({
      organizationId: quote.organizationId,
      type: 'quote_response',
      title: `Quote ${answer === 'accepted' ? 'Accepted' : 'Changes Requested'}`,
      message: `${customerName} ${actionLabel} quote ${quote.quoteNumber || quote.title}`,
      entityType: 'quote',
      entityId: quote.id,
      entityUrl: `/quotes/${quote.id}`,
    })
  }
  return true
}
