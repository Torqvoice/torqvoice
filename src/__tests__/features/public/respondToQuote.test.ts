import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/notify', () => ({
  notify: vi.fn(),
}))

import { respondToQuote } from '@/features/quotes/Actions/quoteResponseActions'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

const mockFindFirst = vi.mocked(db.quote.findFirst)
const mockUpdate = vi.mocked(db.quote.updateMany)
const mockNotify = vi.mocked(notify)

const SENT_QUOTE = {
  id: 'quote-1',
  quoteNumber: 'QT-0001',
  title: 'Oil Change',
  status: 'sent',
  organizationId: 'org-1',
  customer: { name: 'John Doe' },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUpdate.mockResolvedValue({ count: 1 })
})

describe('respondToQuote', () => {
  it('throws ZodError when required fields are missing', async () => {
    await expect(respondToQuote({})).rejects.toThrow()
  })

  it('throws ZodError when action is not a valid enum value', async () => {
    await expect(
      respondToQuote({ quoteId: 'q-1', publicToken: 'tok-1', action: 'rejected' })
    ).rejects.toThrow()
  })

  it('returns error when quote is not found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await respondToQuote({
      quoteId: 'bad-id',
      publicToken: 'bad-token',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'Quote not found' })
  })

  it('returns error when quote status is already accepted', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, status: 'accepted' } as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be updated' })
  })

  it('returns error when quote status is rejected', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, status: 'rejected' } as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be updated' })
  })

  it('returns error when quote status is expired', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, status: 'expired' } as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be updated' })
  })

  it('returns error when quote status is converted', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, status: 'converted' } as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be updated' })
  })

  it('accepts a sent quote and updates status', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      // One statement: the answer is written only while the quote can still take one.
      where: { id: 'quote-1', organizationId: 'org-1', status: { in: ['draft', 'sent'] } },
      data: { status: 'accepted', customerMessage: null, responseDismissedAt: null },
    })
  })

  it('leaves a quote alone that the workshop converted while the customer was answering', async () => {
    // The page read "sent"; by the time the answer is written it is converted.
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    mockUpdate.mockResolvedValue({ count: 0 })
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: false, error: 'This quote can no longer be updated' })
    // The workshop is not told of an answer that did not happen.
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('counts one of two answers sent at the same moment', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    mockUpdate.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const answer = { quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' }
    const results = await Promise.all([respondToQuote(answer), respondToQuote(answer)])
    expect(results.map((result) => result.success).sort()).toEqual([false, true])
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('accepts a draft quote', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, status: 'draft' } as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'accepted',
    })
    expect(result).toEqual({ success: true })
  })

  it('submits changes_requested and stores customer message', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    const result = await respondToQuote({
      quoteId: 'quote-1',
      publicToken: 'tok-1',
      action: 'changes_requested',
      message: 'Please add an extra oil filter',
    })
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'quote-1', organizationId: 'org-1', status: { in: ['draft', 'sent'] } },
      data: {
        status: 'changes_requested',
        customerMessage: 'Please add an extra oil filter',
        responseDismissedAt: null,
      },
    })
  })

  it('stores null customerMessage when no message is provided', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerMessage: null }) })
    )
  })

  it('sends a notification after accepting', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' })
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        type: 'quote_response',
        title: 'Quote Accepted',
        entityId: 'quote-1',
      })
    )
  })

  it('sends a notification after changes_requested', async () => {
    mockFindFirst.mockResolvedValue(SENT_QUOTE as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'changes_requested' })
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quote_response', title: 'Quote Changes Requested' })
    )
  })

  it('does not send a notification when quote has no organizationId', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, organizationId: null } as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('uses customer name in notification message', async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, customer: { name: 'Alice' } } as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' })
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Alice') })
    )
  })

  it("falls back to 'A customer' in notification when customer name is missing", async () => {
    mockFindFirst.mockResolvedValue({ ...SENT_QUOTE, customer: null } as any)
    await respondToQuote({ quoteId: 'quote-1', publicToken: 'tok-1', action: 'accepted' })
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('A customer') })
    )
  })
})
