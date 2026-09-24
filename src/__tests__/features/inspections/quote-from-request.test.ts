/**
 * A quote raised from an inspection is the customer's request when there is
 * one: the checks they ticked and nothing else, with their message on the
 * quote. Without a request it prices every defect, worst first, as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    inspection: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}))
vi.mock('@/features/quotes/Lib/createQuoteRecord', () => ({
  createQuoteRecord: vi.fn(async () => ({ id: 'quote-1', quoteNumber: 'Q-1' })),
}))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({ inspectionFileUrls: vi.fn(async () => []) }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))

import { createQuoteFromInspection } from '@/features/inspections/Actions/inspectionActions'
import { createQuoteRecord } from '@/features/quotes/Lib/createQuoteRecord'

const ITEMS = [
  { id: 'wipers', name: 'Wipers', code: null, notes: null, condition: 'attention', sortOrder: 0 },
  {
    id: 'hose',
    name: 'Brake hose',
    code: '1.1.13',
    notes: 'Chafed',
    condition: 'dangerous',
    sortOrder: 1,
  },
  { id: 'tyres', name: 'Tyres', code: null, notes: null, condition: 'fail', sortOrder: 2 },
  { id: 'horn', name: 'Horn', code: null, notes: null, condition: 'pass', sortOrder: 3 },
]

const inspectionWith = (quoteRequests: unknown[]) => ({
  id: 'insp-1',
  vehicle: { id: 'veh-1', make: 'Ford', model: 'Focus', year: 2019, customerId: 'cust-1' },
  template: { name: 'Annual test' },
  items: ITEMS,
  quoteRequests,
})

const quoteWritten = () =>
  vi.mocked(createQuoteRecord).mock.calls[0][1] as {
    laborItems: { description: string }[]
    notes?: string
  }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a quote raised from an inspection', () => {
  it('prices every defect, worst first, when nobody asked for anything', async () => {
    db.inspection.findFirst.mockResolvedValue(inspectionWith([]))
    const result = await createQuoteFromInspection('insp-1')
    expect(result.success).toBe(true)
    expect(quoteWritten().laborItems.map((l) => l.description)).toEqual([
      'Annual test',
      '1.1.13 Brake hose: Chafed',
      'Tyres',
      'Wipers',
    ])
    expect(quoteWritten().notes).toBeUndefined()
  })

  it('prices only what the customer ticked, and carries their message', async () => {
    db.inspection.findFirst.mockResolvedValue(
      inspectionWith([
        {
          id: 'req-1',
          message: 'Just the tyres and the horn please',
          selectedItemIds: ['horn', 'tyres'],
        },
      ])
    )
    await createQuoteFromInspection('insp-1')
    // Checklist order, not worst first: the customer's list is the list.
    expect(quoteWritten().laborItems.map((l) => l.description)).toEqual([
      'Annual test',
      'Tyres',
      'Horn',
    ])
    expect(quoteWritten().notes).toBe(
      'quoteFromRequestNote\nquoteCustomerSaid:Just the tyres and the horn please'
    )
  })

  it('falls back to the defects when every requested check is gone', async () => {
    db.inspection.findFirst.mockResolvedValue(
      inspectionWith([{ id: 'req-1', message: null, selectedItemIds: ['deleted-check'] }])
    )
    await createQuoteFromInspection('insp-1')
    expect(quoteWritten().laborItems).toHaveLength(4)
    expect(quoteWritten().notes).toBe('quoteFromRequestNote')
  })

  it('asks the database for the pending request alongside the checks', async () => {
    db.inspection.findFirst.mockResolvedValue(inspectionWith([]))
    await createQuoteFromInspection('insp-1')
    expect(db.inspection.findFirst.mock.calls[0][0].include.quoteRequests).toMatchObject({
      where: { status: 'pending' },
      take: 1,
    })
  })
})
