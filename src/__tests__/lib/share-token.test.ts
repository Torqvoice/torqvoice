/**
 * A document's share link is minted once. Two sends racing for the first link
 * must end up handing out the same one, and a link the customer already holds
 * is never replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

function table() {
  return { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn() }
}
const quote = table()
const serviceRecord = table()
const inspection = table()
vi.mock('@/lib/db', () => ({ db: { quote, serviceRecord, inspection } }))

const { ensureShareToken } = await import('@/lib/share-token.server')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a document’s share link', () => {
  it('is only written while the document has none, inside its own workshop', async () => {
    quote.findFirst.mockResolvedValue({ publicToken: 'minted' })

    await ensureShareToken('quote', 'q1', 'org1')

    expect(quote.updateMany.mock.calls[0][0].where).toEqual({
      id: 'q1',
      organizationId: 'org1',
      publicToken: null,
    })
  })

  it('is the one that was stored, not the one this send tried to write', async () => {
    // Another send got there first: the write matched nothing.
    quote.updateMany.mockResolvedValue({ count: 0 })
    quote.findFirst.mockResolvedValue({ publicToken: 'held-by-customer' })

    expect(await ensureShareToken('quote', 'q1', 'org1')).toBe('held-by-customer')
  })

  it('is null for a document this workshop does not have', async () => {
    serviceRecord.updateMany.mockResolvedValue({ count: 0 })
    serviceRecord.findFirst.mockResolvedValue(null)

    expect(await ensureShareToken('invoice', 'theirs', 'org1')).toBeNull()
  })

  it.each([
    ['invoice', serviceRecord],
    ['inspection', inspection],
  ] as const)('is minted for an %s the same way', async (kind, model) => {
    model.findFirst.mockResolvedValue({ publicToken: 'tok' })

    expect(await ensureShareToken(kind, 'd1', 'org1')).toBe('tok')
    expect(model.updateMany.mock.calls[0][0].where.publicToken).toBeNull()
  })
})

describe('sending a document that already has a link', () => {
  it('starts the workshop’s expiry counting again and keeps the link', async () => {
    quote.findFirst.mockResolvedValue({ publicToken: 'held-by-customer' })

    expect(await ensureShareToken('quote', 'q1', 'org1')).toBe('held-by-customer')

    const renewed = quote.updateMany.mock.calls.find((c) => 'shareRenewedAt' in c[0].data)
    expect(renewed?.[0].where).toMatchObject({ id: 'q1', organizationId: 'org1' })
    expect(renewed?.[0].data.shareRenewedAt).toBeInstanceOf(Date)
  })

  it('drops a date on the document only when that date has passed', async () => {
    serviceRecord.findFirst.mockResolvedValue({ publicToken: 'tok' })

    await ensureShareToken('invoice', 'i1', 'org1')

    const dropped = serviceRecord.updateMany.mock.calls.find(
      (c) => c[0].data.shareExpiresAt === null
    )
    expect(dropped?.[0].where.shareExpiresAt.lt).toBeInstanceOf(Date)
  })
})
