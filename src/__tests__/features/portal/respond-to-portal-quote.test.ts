/**
 * A signed-in customer answering a quote in the portal. Only their own quote,
 * only while it waits for an answer, and the answer goes the same way as one
 * given on the shared quote page. The workshop here is in Auckland, half a
 * day ahead of the server, so "still valid today" is the workshop's today.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { quote: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: vi.fn() }))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/features/quotes/Lib/recordQuoteResponse', () => ({
  recordQuoteResponse: vi.fn(async () => true),
}))

import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'
import { recordQuoteResponse } from '@/features/quotes/Lib/recordQuoteResponse'
import { freezeOrganization, unfreezeOrganization } from '@/lib/backup/freeze'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'

const sent = {
  id: 'q1',
  organizationId: 'org1',
  quoteNumber: 'Q-1001',
  title: 'Brake overhaul',
  status: 'sent',
  validUntil: null as Date | null,
  customer: { name: 'Kari' },
}

describe('answering a quote in the portal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    // 09:00 on 21 November in Auckland, still the evening of the 20th in UTC.
    vi.setSystemTime(new Date('2026-11-20T20:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(getCustomerSession).mockResolvedValue({ customerId: 'c1', organizationId: 'org1' })
    vi.mocked(db.quote.findFirst).mockResolvedValue(sent as never)
    vi.mocked(recordQuoteResponse).mockResolvedValue(true)
  })

  it('accepts through the same path as the shared quote page', async () => {
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })

    expect(result).toEqual({ success: true, data: { status: 'accepted' } })
    // Only from "sent": the write itself refuses any other status.
    expect(recordQuoteResponse).toHaveBeenCalledWith(sent, 'accepted', undefined, {
      from: ['sent'],
    })
    // The portal writes nothing itself: the shared path owns the status change.
    expect(db.quote.update).not.toHaveBeenCalled()
    expect(db.quote.updateMany).not.toHaveBeenCalled()
  })

  it('refuses an answer that lost to the workshop converting the quote meanwhile', async () => {
    // Read as "sent", but no longer so when the answer was written.
    vi.mocked(recordQuoteResponse).mockResolvedValue(false)
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be answered' })
  })

  it('passes on what the customer wants changed', async () => {
    await respondToPortalQuote({
      quoteId: 'q1',
      answer: 'changes_requested',
      message: '  Leave out the wipers ',
    })
    expect(recordQuoteResponse).toHaveBeenCalledWith(
      sent,
      'changes_requested',
      'Leave out the wipers',
      { from: ['sent'] }
    )
  })

  it('refuses a change request that says nothing', async () => {
    const result = await respondToPortalQuote({
      quoteId: 'q1',
      answer: 'changes_requested',
      message: '   ',
    })
    expect(result.success).toBe(false)
    expect(recordQuoteResponse).not.toHaveBeenCalled()
  })

  it("refuses another customer's quote", async () => {
    // The lookup is by the signed-in customer and workshop, so theirs is not found.
    vi.mocked(db.quote.findFirst).mockResolvedValue(null)

    const result = await respondToPortalQuote({ quoteId: 'someone-elses', answer: 'accepted' })

    expect(result).toEqual({ success: false, error: 'Quote not found' })
    expect(recordQuoteResponse).not.toHaveBeenCalled()
    const where = vi.mocked(db.quote.findFirst).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      id: 'someone-elses',
      customerId: 'c1',
      organizationId: 'org1',
      // Never a draft, and only one that reached the customer.
      status: { not: 'draft' },
    })
    expect(where).not.toHaveProperty('publicToken')
  })

  it.each([
    'accepted',
    'changes_requested',
    'rejected',
    'converted',
    'expired',
  ])('refuses a quote that is already %s', async (status) => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ ...sent, status } as never)
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be answered' })
    expect(recordQuoteResponse).not.toHaveBeenCalled()
  })

  it("refuses a quote whose last valid day has passed on the workshop's calendar", async () => {
    // Valid until 20 November in Auckland; there it is already the 21st.
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      ...sent,
      validUntil: new Date('2026-11-19T11:00:00Z'),
    } as never)
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
    expect(result.success).toBe(false)
    expect(recordQuoteResponse).not.toHaveBeenCalled()
  })

  it('still takes an answer on the last valid day, though the server is a day behind', async () => {
    // Valid until 21 November in Auckland, which is today there.
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      ...sent,
      validUntil: new Date('2026-11-20T11:00:00Z'),
    } as never)
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
    expect(result.success).toBe(true)
    expect(recordQuoteResponse).toHaveBeenCalled()
  })

  it('takes no answer while the workshop is being restored from a backup', async () => {
    freezeOrganization('org1')
    try {
      const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
      expect(result.success).toBe(false)
      expect(recordQuoteResponse).not.toHaveBeenCalled()
    } finally {
      unfreezeOrganization('org1')
    }
  })

  it('refuses someone who is not signed in', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue(null)
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'accepted' })
    expect(result.success).toBe(false)
    expect(db.quote.findFirst).not.toHaveBeenCalled()
    expect(recordQuoteResponse).not.toHaveBeenCalled()
  })

  it('refuses an answer that is not one of the two', async () => {
    const result = await respondToPortalQuote({ quoteId: 'q1', answer: 'converted' })
    expect(result.success).toBe(false)
    expect(recordQuoteResponse).not.toHaveBeenCalled()
  })
})
