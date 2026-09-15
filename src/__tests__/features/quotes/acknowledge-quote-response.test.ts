/**
 * Tests for acknowledgeQuoteResponse — the workshop dealing with a customer's
 * answer, from the dashboard's dismiss button or the quote's "Mark as Resolved".
 *
 * It used to put every quote back to draft. For an acceptance that erased the
 * customer's agreement, and where accepted quotes lock it released the lock
 * without an owner or admin. A change request still goes back to draft; an
 * acceptance only leaves the list of responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    quote: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}))

import { revalidatePath } from 'next/cache'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  acknowledgeQuoteResponse,
  getQuoteResponses,
} from '@/features/quotes/Actions/quoteResponseActions'

const ORG = 'org-1'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.quote.update).mockResolvedValue({} as any)
  vi.mocked(db.quote.findMany).mockResolvedValue([])
})

describe('acknowledgeQuoteResponse', () => {
  it('keeps an accepted quote accepted and only dismisses the response', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'q1', status: 'accepted' } as any)

    const result = await acknowledgeQuoteResponse('q1')

    expect(result).toMatchObject({ success: true, data: { status: 'accepted' } })
    const { data } = vi.mocked(db.quote.update).mock.calls[0][0] as any
    expect(data.status).toBeUndefined()
    expect(data.customerMessage).toBeUndefined()
    expect(data.responseDismissedAt).toBeInstanceOf(Date)
  })

  it('sends a change request back to draft', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      id: 'q1',
      status: 'changes_requested',
    } as any)

    const result = await acknowledgeQuoteResponse('q1')

    expect(result).toMatchObject({ success: true, data: { status: 'draft' } })
    expect(db.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { status: 'draft', customerMessage: null },
    })
  })

  it('refreshes the dashboard, so a dismissed row does not wait for a reload', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'q1', status: 'accepted' } as any)

    await acknowledgeQuoteResponse('q1')

    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('refuses a quote from another workshop and changes nothing', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(null)

    const result = await acknowledgeQuoteResponse('q1')

    expect(result.success).toBe(false)
    expect(db.quote.findFirst).toHaveBeenCalledWith({ where: { id: 'q1', organizationId: ORG } })
    expect(db.quote.update).not.toHaveBeenCalled()
  })
})

describe('getQuoteResponses', () => {
  it('leaves out responses the workshop has dismissed', async () => {
    await getQuoteResponses()

    const { where } = vi.mocked(db.quote.findMany).mock.calls[0][0] as any
    expect(where).toMatchObject({ organizationId: ORG, responseDismissedAt: null })
  })
})
