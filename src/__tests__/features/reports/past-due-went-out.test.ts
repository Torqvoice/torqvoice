/**
 * An invoice nobody sent cannot be overdue. The Past Due Invoices report,
 * on screen and in the scheduled email, lists only invoices that went out:
 * issued, or sent, paid or marked paid before issuing existed. A draft with
 * a due date typed in stays off it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn(async () => 'Shop <shop@example.com>'),
}))
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('pdf')),
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({
  pdfFontsReady: async () => undefined,
}))
vi.mock('@/features/reports/Components/ReportPDF', () => ({ ReportPDF: () => null }))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: async () => 'America/Chicago',
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    reportSchedule: { update: vi.fn() },
  },
}))

import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { getPastDueInvoicesReport } from '@/features/reports/Actions/reportActions'
import { processOneSchedule } from '@/lib/cron/report-schedules'
import { WENT_OUT_WHERE, wasIssuedBeforeTracking } from '@/features/invoices/Lib/issuedInvoice'

type Row = {
  id: string
  issuedAt: Date | null
  sentAt: Date | null
  manuallyPaid: boolean
  payments: { amount: number }[]
}

/** Just enough of Prisma's where to run the clauses these queries use. */
function matches(row: Row, where: any): boolean {
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'AND') return cond.every((c: any) => matches(row, c))
    if (key === 'OR') return cond.some((c: any) => matches(row, c))
    if (key === 'payments') return row.payments.length > 0 === Boolean(cond.some)
    const value = (row as any)[key]
    if (cond && typeof cond === 'object' && 'lt' in cond) return value < cond.lt
    if (cond && typeof cond === 'object' && 'not' in cond) return value !== cond.not
    return value === cond
  })
}

const base = {
  organizationId: 'org-1',
  status: 'completed',
  invoiceNumber: 'INV-1',
  invoiceDueDate: new Date('2026-05-01T05:00:00Z'),
  totalAmount: 84,
  cost: 84,
  customer: { name: 'Test Customer', company: null },
  vehicle: null,
}

const rows: Row[] = [
  // A draft with a due date in the past, never sent: the bug.
  { id: 'draft', issuedAt: null, sentAt: null, manuallyPaid: false, payments: [] },
  {
    id: 'issued',
    issuedAt: new Date('2026-04-01'),
    sentAt: null,
    manuallyPaid: false,
    payments: [],
  },
  // Sent before issuing existed.
  {
    id: 'legacy-sent',
    issuedAt: null,
    sentAt: new Date('2026-04-01'),
    manuallyPaid: false,
    payments: [],
  },
  // Part paid before issuing existed.
  {
    id: 'legacy-paid',
    issuedAt: null,
    sentAt: null,
    manuallyPaid: false,
    payments: [{ amount: 10 }],
  },
]

/** The mocked database answers with the rows the query would select. */
function serveRows() {
  vi.mocked(db.serviceRecord.findMany).mockImplementation((async ({ where }: any) =>
    rows.map((r) => ({ ...base, ...r })).filter((r) => matches(r, where))) as any)
}

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ now: new Date('2026-06-25T12:00:00Z'), toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('which invoices went out', () => {
  it('agrees with the rule invoice settings uses for invoices sent before issuing', () => {
    const samples: Row[] = [
      ...rows,
      { id: 'marked-paid', issuedAt: null, sentAt: null, manuallyPaid: true, payments: [] },
      {
        id: 'issued-and-sent',
        issuedAt: new Date(),
        sentAt: new Date(),
        manuallyPaid: false,
        payments: [],
      },
    ]
    for (const row of samples) {
      expect(matches(row, WENT_OUT_WHERE)).toBe(
        Boolean(row.issuedAt) || wasIssuedBeforeTracking(row)
      )
    }
  })
})

describe('the Past Due Invoices report', () => {
  it('leaves out a draft that was never sent, however late its due date', async () => {
    setupAuth()
    serveRows()

    const result = await getPastDueInvoicesReport()

    expect(result.success).toBe(true)
    expect(result.data!.invoices.map((i) => i.id)).toEqual(['issued', 'legacy-sent', 'legacy-paid'])
    const where = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0]!.where as any
    expect(where.organizationId).toBe('org-1')
    expect(where.status).toEqual({ not: 'cancelled' })
    expect(where.AND).toEqual([WENT_OUT_WHERE])
  })
})

describe('the scheduled Past Due email', () => {
  it('lists the same invoices as the report on screen', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
    vi.mocked(db.user.findMany).mockResolvedValue([] as any)
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Shop' } as any)
    vi.mocked(db.reportSchedule.update).mockResolvedValue({} as any)
    serveRows()

    await processOneSchedule(
      {
        id: 'sched-1',
        name: 'Weekly',
        frequency: 'weekly',
        dateRange: 'last7d',
        sections: JSON.stringify(['pastDue']),
        recipients: JSON.stringify([]),
        organizationId: 'org-1',
        endDate: null,
      },
      'America/Chicago'
    )

    const where = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0]!.where as any
    expect(where.organizationId).toBe('org-1')
    expect(where.AND).toEqual([WENT_OUT_WHERE])
    const element = vi.mocked(renderToBuffer).mock.calls[0][0] as any
    expect(element.props.pastDueData.invoices.map((i: any) => i.id)).toEqual([
      'issued',
      'legacy-sent',
      'legacy-paid',
    ])
  })
})
