/**
 * What an invoice's share page asks for is also what its link counts as owed.
 * A job that carries only a cost is not paid just because its total is empty.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: async () => null }))

const { invoiceDisplayTotal } = await import('@/lib/invoice-display-total')
const { shareFacts } = await import('@/lib/share-link.server')

const invoice = {
  totalAmount: 0,
  cost: 0,
  taxRate: 0,
  taxInclusive: false,
  discountType: null,
  discountValue: 0,
  partItems: [],
  laborItems: [],
}
const link = {
  sharedAt: null,
  shareRenewedAt: null,
  shareExpiresAt: null,
  shareNeverExpires: false,
}
const unpaid = { manuallyPaid: false, manuallyPaidAt: null, payments: [] }

describe('the total a shared invoice asks for', () => {
  it('is the stored total when there is one', () => {
    expect(invoiceDisplayTotal({ ...invoice, totalAmount: 250, cost: 90 })).toBe(250)
  })

  it('is what the lines add up to when no total was stored', () => {
    const lines = { partItems: [{ total: 80 }], laborItems: [{ total: 120 }] }
    expect(invoiceDisplayTotal({ ...invoice, ...lines })).toBe(200)
  })

  it('is the plain cost of a job with neither', () => {
    expect(invoiceDisplayTotal({ ...invoice, cost: 125 })).toBe(125)
  })
})

describe('whether a shared invoice is paid', () => {
  it('is not, for a job with only a cost on it and no payment', () => {
    const facts = shareFacts(link, { ...invoice, cost: 125, ...unpaid })
    expect(facts.payment).toEqual({ paid: false, at: null })
  })

  it('is, once the payments cover that cost', () => {
    const at = new Date('2026-11-01T10:00:00Z')
    const facts = shareFacts(link, {
      ...invoice,
      cost: 125,
      ...unpaid,
      payments: [{ amount: 125, date: at }],
    })
    expect(facts.payment).toEqual({ paid: true, at })
  })
})
