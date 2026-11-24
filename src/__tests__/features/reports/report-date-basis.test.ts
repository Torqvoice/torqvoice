/**
 * Which month a job counts in on the revenue and tax reports.
 *
 * Revenue and tax follow the invoice date, not the day the job started: a
 * job opened in September and invoiced in November is November's revenue.
 * Collected follows each payment's own date. The workshop here is in
 * Auckland, so every instant below sits on a different day there than in UTC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
// A plain function, so resetAllMocks cannot blank it.
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Pacific/Auckland' }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  getRevenueReport,
  getServiceReport,
  getTaxReport,
  getTechnicianReport,
} from '@/features/reports/Actions/reportActions'

/** 31 Aug 13:00Z is 1 Sep 01:00 in Auckland (NZST, +12). */
const SEP_1 = new Date('2026-08-31T13:00:00Z')
/** 14 Sep 12:00Z is 15 Sep 00:00 in Auckland. */
const SEP_15 = new Date('2026-09-14T12:00:00Z')
/** 31 Oct 12:00Z is 1 Nov 01:00 in Auckland (NZDT, +13): October in UTC, November there. */
const NOV_1 = new Date('2026-10-31T12:00:00Z')
/** 19 Nov 12:00Z is 20 Nov 01:00 in Auckland. */
const NOV_20 = new Date('2026-11-19T12:00:00Z')

/** 1 Sep to 30 Nov on the workshop's calendar. */
const WINDOW = { startDate: '2026-09-01', endDate: '2026-11-30' }
/** The same window as instants: Auckland midnight on 1 Sep, and on 1 Dec (exclusive). */
const RANGE = {
  gte: new Date('2026-08-31T12:00:00.000Z'),
  lt: new Date('2026-11-30T11:00:00.000Z'),
}

function job(fields: Record<string, unknown>) {
  return {
    serviceDate: SEP_1,
    startDateTime: SEP_1,
    invoiceDate: null,
    totalAmount: 1000,
    cost: 0,
    type: 'repair',
    taxRate: 0,
    taxInclusive: false,
    subtotal: 1000,
    discountAmount: 0,
    manuallyPaid: false,
    manuallyPaidAt: null,
    payments: [],
    partItems: [],
    laborItems: [],
    ...fields,
  }
}

const isManualQuery = (args: any) =>
  (args?.where?.AND ?? []).some((c: any) => c.manuallyPaid === true)

/** The invoices query answers `invoices`, the paid-by-hand query `manual`. */
function seed({
  invoices = [],
  manual = [],
  payments = [],
}: {
  invoices?: unknown[]
  manual?: unknown[]
  payments?: { amount: number; date: Date }[]
}) {
  vi.mocked(db.serviceRecord.findMany).mockImplementation((async (args: any) =>
    isManualQuery(args) ? manual : invoices) as any)
  vi.mocked(db.payment.findMany).mockResolvedValue(payments as any)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  seed({})
})

const months = (data: any) =>
  data.monthly.map((m: any) => ({ month: m.month, revenue: m.revenue, collected: m.collected }))

describe('revenue', () => {
  it('asks for invoices dated in the workshop window, falling back to start and service date', async () => {
    await getRevenueReport(WINDOW)

    const where = (vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as any).where
    expect(where.AND).toEqual([
      {
        OR: [
          { invoiceDate: RANGE },
          { invoiceDate: null, startDateTime: RANGE },
          { invoiceDate: null, startDateTime: null, serviceDate: RANGE },
        ],
      },
    ])
    const paymentWhere = (vi.mocked(db.payment.findMany).mock.calls[0][0] as any).where
    expect(paymentWhere).toEqual({ date: RANGE, serviceRecord: { organizationId: 'org-1' } })
  })

  it('counts a job started in September and invoiced in November in November', async () => {
    seed({ invoices: [job({ startDateTime: SEP_1, invoiceDate: NOV_1 })] })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([{ month: '2026-11', revenue: 1000, collected: 0 }])
  })

  it('counts a November payment on a September invoice as collected in November', async () => {
    seed({
      invoices: [job({ invoiceDate: SEP_15, payments: [{ amount: 400 }] })],
      payments: [{ amount: 400, date: NOV_1 }],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([
      { month: '2026-09', revenue: 1000, collected: 0 },
      { month: '2026-11', revenue: 0, collected: 400 },
    ])
    expect(data?.summary.totalCollected).toBe(400)
    expect(data?.summary.outstanding).toBe(600)
  })

  it('puts the months in order whatever order the rows come in', async () => {
    seed({
      invoices: [job({ invoiceDate: NOV_20 }), job({ invoiceDate: SEP_15 })],
      payments: [{ amount: 50, date: NOV_1 }],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(data?.monthly.map((m: any) => m.month)).toEqual(['2026-09', '2026-11'])
  })

  it('counts a job with neither an invoice date nor a start on its service date', async () => {
    seed({ invoices: [job({ invoiceDate: null, startDateTime: null, serviceDate: NOV_1 })] })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([{ month: '2026-11', revenue: 1000, collected: 0 }])
  })

  it('counts a payment refunded through the ledger off what was collected', async () => {
    seed({
      payments: [
        { amount: 100, date: NOV_1 },
        { amount: -40, date: NOV_20 },
      ],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(data?.summary.totalCollected).toBe(60)
    expect(months(data)).toEqual([{ month: '2026-11', revenue: 0, collected: 60 }])
  })
})

describe('jobs marked paid by hand', () => {
  it('count as collected on the day they were marked', async () => {
    seed({
      manual: [job({ invoiceDate: SEP_15, manuallyPaid: true, manuallyPaidAt: NOV_1 })],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([{ month: '2026-11', revenue: 0, collected: 1000 }])
  })

  it('count on the invoice date when marked before that day was recorded', async () => {
    seed({ manual: [job({ invoiceDate: SEP_15, manuallyPaid: true, manuallyPaidAt: null })] })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([{ month: '2026-09', revenue: 0, collected: 1000 }])
  })

  it('add only what the payments did not cover', async () => {
    seed({
      manual: [
        job({
          totalAmount: 200,
          invoiceDate: SEP_15,
          manuallyPaid: true,
          manuallyPaidAt: NOV_1,
          payments: [{ amount: 50, date: SEP_15 }],
        }),
      ],
      payments: [{ amount: 50, date: SEP_15 }],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([
      { month: '2026-09', revenue: 0, collected: 50 },
      { month: '2026-11', revenue: 0, collected: 150 },
    ])
    expect(data?.summary.totalCollected).toBe(200)
  })

  /** 1000 marked paid on 15 September, then `later` arrives on 1 November. */
  const markedInSeptember = (later: number) => {
    const payment = { amount: later, date: NOV_1 }
    seed({
      manual: [
        job({
          invoiceDate: SEP_15,
          manuallyPaid: true,
          manuallyPaidAt: SEP_15,
          payments: [payment],
        }),
      ],
      payments: [payment],
    })
  }

  it('keep September as it was when a refund arrives after the job was marked paid', async () => {
    markedInSeptember(-100)

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([
      { month: '2026-09', revenue: 0, collected: 1000 },
      { month: '2026-11', revenue: 0, collected: -100 },
    ])
  })

  it('keep September as it was when a payment arrives after the job was marked paid', async () => {
    markedInSeptember(300)

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([
      { month: '2026-09', revenue: 0, collected: 1000 },
      { month: '2026-11', revenue: 0, collected: 300 },
    ])
  })

  it('take every payment off when the day it was marked was not recorded', async () => {
    const payment = { amount: 300, date: NOV_1 }
    seed({
      manual: [
        job({
          invoiceDate: SEP_15,
          manuallyPaid: true,
          manuallyPaidAt: null,
          payments: [payment],
        }),
      ],
      payments: [payment],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(months(data)).toEqual([
      { month: '2026-09', revenue: 0, collected: 700 },
      { month: '2026-11', revenue: 0, collected: 300 },
    ])
  })

  it('ask for jobs marked in the window, or unmarked-date jobs dated in it', async () => {
    await getRevenueReport(WINDOW)

    const manualCall = vi
      .mocked(db.serviceRecord.findMany)
      .mock.calls.find(([args]) => isManualQuery(args))
    expect((manualCall?.[0] as any).where.AND[0]).toEqual({
      manuallyPaid: true,
      OR: [
        { manuallyPaidAt: RANGE },
        {
          manuallyPaidAt: null,
          AND: [
            {
              OR: [
                { invoiceDate: RANGE },
                { invoiceDate: null, startDateTime: RANGE },
                { invoiceDate: null, startDateTime: null, serviceDate: RANGE },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe('outstanding', () => {
  it('is what is still unpaid on each invoice in the window, never below nothing', async () => {
    seed({
      invoices: [
        // Overpaid: owes nothing, and does not cancel out what the next one owes.
        job({ totalAmount: 100, invoiceDate: SEP_15, payments: [{ amount: 150 }] }),
        job({ totalAmount: 200, invoiceDate: NOV_1, payments: [{ amount: 50 }] }),
        // Marked paid by hand: owes nothing.
        job({ totalAmount: 300, invoiceDate: NOV_1, manuallyPaid: true }),
      ],
    })

    const { data } = await getRevenueReport(WINDOW)

    expect(data?.summary.outstanding).toBe(150)
  })
})

describe('tax', () => {
  const taxed = (fields: Record<string, unknown>) => ({
    serviceDate: SEP_1,
    startDateTime: SEP_1,
    invoiceDate: null,
    subtotal: 100,
    taxableSubtotal: 100,
    taxRate: 25,
    taxAmount: 25,
    taxInclusive: false,
    taxComponents: null,
    totalAmount: 125,
    ...fields,
  })

  it('counts each invoice in the month of its invoice date, months in order', async () => {
    seed({
      invoices: [
        taxed({ startDateTime: SEP_1, invoiceDate: NOV_1 }),
        taxed({ startDateTime: SEP_1, invoiceDate: SEP_15 }),
      ],
    })

    const { data } = await getTaxReport(WINDOW)

    expect(data?.monthly.map((m: any) => [m.month, m.taxCollected])).toEqual([
      ['2026-09', 25],
      ['2026-11', 25],
    ])
    const where = (vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as any).where
    expect(where.AND[0].OR[0]).toEqual({ invoiceDate: RANGE })
  })
})

describe('workload reports', () => {
  const workDate = {
    OR: [{ startDateTime: RANGE }, { startDateTime: null, serviceDate: RANGE }],
  }

  it('count a job with no start on its service date', async () => {
    await getServiceReport(WINDOW)

    const where = (vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as any).where
    expect(where.AND).toEqual([workDate])
    expect(where.startDateTime).toBeUndefined()
  })

  it('keep the technician filter beside the date filter', async () => {
    await getTechnicianReport(WINDOW)

    const where = (vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as any).where
    expect(where.OR).toEqual([{ technicianId: { not: null } }, { techName: { not: null } }])
    expect(where.AND).toEqual([workDate])
  })
})
