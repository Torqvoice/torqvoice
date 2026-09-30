/**
 * The shop fee on a new quote. A quote almost always starts empty, so a
 * percentage fee starts at nothing; the line is still written, as on a work
 * order, so the editor has something to re-price as the quote fills in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => {
  const tx = {
    quote: { create: vi.fn(async () => ({ id: 'quote-1' })) },
    quotePart: { createMany: vi.fn() },
    quoteLabor: { createMany: vi.fn() },
  }
  return {
    db: {
      appSetting: { findMany: vi.fn() },
      inspection: { findFirst: vi.fn() },
      customer: { findFirst: vi.fn() },
      quote: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      tx,
    },
  }
})
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))

import { createQuoteRecord } from '@/features/quotes/Lib/createQuoteRecord'
import { createQuoteSchema } from '@/features/quotes/Schema/quoteSchema'

const CTX = { organizationId: 'org', userId: 'user' }
const EMPTY = createQuoteSchema.parse({ title: 'Brakes' })

const setting = (key: string, value: string) => ({ key, value })
const PERCENT = [
  setting('invoice.shopFeeEnabled', 'true'),
  setting('invoice.shopFeeLabel', 'Forbruksmateriell'),
  setting('invoice.shopFeeMode', 'percent'),
  setting('invoice.shopFeePercent', '10'),
  setting('invoice.shopFeeBase', 'laborParts'),
]
const FLAT = [
  setting('invoice.shopFeeEnabled', 'true'),
  setting('invoice.shopFeeMode', 'flat'),
  setting('invoice.shopFeeAmount', '150'),
]

const laborWritten = () =>
  (
    db.tx.quoteLabor.createMany.mock.calls[0]?.[0] as
      | { data: Record<string, unknown>[] }
      | undefined
  )?.data
const quoteWritten = () =>
  (db.tx.quote.create.mock.calls as unknown as [{ data: Record<string, unknown> }][])[0][0].data

beforeEach(() => {
  vi.clearAllMocks()
  db.quote.findFirst.mockResolvedValue(null)
})

describe('the shop fee on a new quote', () => {
  it('writes a percentage fee line at nothing on an empty quote, to be re-priced', async () => {
    db.appSetting.findMany.mockResolvedValue(PERCENT)
    await createQuoteRecord(CTX, { ...EMPTY })

    expect(laborWritten()).toMatchObject([
      { description: 'Forbruksmateriell', pricingType: 'shopFee', hours: 1, rate: 0, total: 0 },
    ])
    expect(quoteWritten().subtotal).toBe(0)
    expect(quoteWritten().totalAmount).toBe(0)
  })

  it('writes a flat fee priced and totalled', async () => {
    db.appSetting.findMany.mockResolvedValue(FLAT)
    await createQuoteRecord(CTX, { ...EMPTY })

    expect(laborWritten()).toMatchObject([{ pricingType: 'shopFee', rate: 150, total: 150 }])
    expect(quoteWritten().subtotal).toBe(150)
    expect(quoteWritten().totalAmount).toBe(150)
  })

  it('writes no fee line when the fee is for work orders only', async () => {
    db.appSetting.findMany.mockResolvedValue([
      ...FLAT,
      setting('invoice.shopFeeAppliesTo', 'workOrders'),
    ])
    await createQuoteRecord(CTX, { ...EMPTY })
    expect(laborWritten()).toBeUndefined()
    expect(quoteWritten().subtotal).toBe(0)
  })

  it('writes no fee line when the workshop charges none', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    await createQuoteRecord(CTX, { ...EMPTY })
    expect(laborWritten()).toBeUndefined()
  })
})
