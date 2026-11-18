// @vitest-environment node
/**
 * A customer's answer to a quote reaches the workshop's bell, and the
 * notification opens that quote: not the dashboard, not the list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { quote: { updateMany: vi.fn() } } }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))

import { recordQuoteResponse } from '@/features/quotes/Lib/recordQuoteResponse'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

const quote = {
  id: 'q1',
  organizationId: 'org1',
  quoteNumber: 'Q-2026-010',
  title: 'Suspension refresh',
  customer: { name: 'Sarah Coleman' },
}

describe("a customer's answer in the workshop's bell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.quote.updateMany).mockResolvedValue({ count: 1 })
  })

  it('opens the quote when the customer asked for changes', async () => {
    await recordQuoteResponse(quote, 'changes_requested', 'Without the rear arms?', {
      from: ['sent'],
    })
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Quote Changes Requested',
        entityType: 'quote',
        entityId: 'q1',
        entityUrl: '/quotes/q1',
      })
    )
  })

  it('opens the quote when the customer accepted it', async () => {
    await recordQuoteResponse(quote, 'accepted', null, { from: ['sent'] })
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quote Accepted', entityUrl: '/quotes/q1' })
    )
  })

  it('tells nobody about an answer that did not happen', async () => {
    vi.mocked(db.quote.updateMany).mockResolvedValue({ count: 0 })
    expect(await recordQuoteResponse(quote, 'accepted', null, { from: ['sent'] })).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})
