/**
 * Report schedules run at 08:00 on the workshop's clock and report over
 * whole workshop days, whatever zone the server runs in.
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
// The PDF side is not under test: keep the element so its props can be read.
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('pdf')),
}))
vi.mock('@/features/vehicles/Components/invoice-pdf/fonts', () => ({}))
vi.mock('@/features/reports/Components/ReportPDF', () => ({ ReportPDF: () => null }))
// A plain function, so a resetAllMocks in a beforeEach cannot blank it.
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: async () => 'America/Chicago',
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    reportSchedule: { create: vi.fn(), update: vi.fn() },
  },
}))

import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { createReportSchedule } from '@/features/report-schedule/Actions/reportScheduleActions'
import { processOneSchedule } from '@/lib/cron/report-schedules'

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
  // 1 Jul 2026 12:00Z is 07:00 CDT in Chicago
  vi.useFakeTimers({ now: new Date('2026-07-01T12:00:00Z'), toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createReportSchedule', () => {
  it('sets the next run to 08:00 in the workshop and the end date to the end of its day', async () => {
    setupAuth()
    vi.mocked(db.reportSchedule.create).mockImplementation((async ({ data }: any) => ({
      id: 'sched-1',
      ...data,
    })) as any)

    const result = await createReportSchedule({
      frequency: 'weekly',
      sections: ['revenue'],
      recipients: ['user-1'],
      endDate: '2026-07-31',
    })

    expect(result.success).toBe(true)
    const data = vi.mocked(db.reportSchedule.create).mock.calls[0][0].data
    // 08:00 CDT on 8 Jul is 13:00Z, not the 08:00Z a UTC server would pick
    expect(data.nextRunDate).toEqual(new Date('2026-07-08T13:00:00.000Z'))
    expect(data.endDate).toEqual(new Date('2026-08-01T04:59:59.999Z'))
  })
})

describe('processOneSchedule', () => {
  it('reports over whole workshop days, buckets by workshop month and reschedules at 08:00 local', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      {
        serviceDate: new Date('2026-07-01T03:00:00Z'),
        // 30 Jun 22:00 in Chicago, still June there
        startDateTime: new Date('2026-07-01T03:00:00Z'),
        totalAmount: 100,
        cost: 100,
        type: 'repair',
        taxRate: 0,
        taxInclusive: false,
        manuallyPaid: true,
        payments: [],
        partItems: [],
        laborItems: [],
      },
    ] as any)
    vi.mocked(db.user.findMany).mockResolvedValue([] as any)
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Shop' } as any)
    vi.mocked(db.reportSchedule.update).mockResolvedValue({} as any)

    await processOneSchedule(
      {
        id: 'sched-1',
        name: 'Weekly',
        frequency: 'daily',
        dateRange: 'last7d',
        sections: JSON.stringify(['revenue']),
        recipients: JSON.stringify([]),
        organizationId: 'org-1',
        endDate: null,
      },
      'America/Chicago'
    )

    const where = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0]?.where as any
    expect(where.startDateTime).toEqual({
      gte: new Date('2026-06-24T05:00:00.000Z'),
      lte: new Date('2026-07-02T04:59:59.999Z'),
    })

    const element = vi.mocked(renderToBuffer).mock.calls[0][0] as any
    expect(element.props.dateRange).toBe('Jun 24, 2026 – Jul 1, 2026')
    expect(element.props.revenueData.monthly.map((m: any) => m.month)).toEqual(['2026-06'])

    const update = vi.mocked(db.reportSchedule.update).mock.calls[0][0].data as any
    expect(update.nextRunDate).toEqual(new Date('2026-07-02T13:00:00.000Z'))
  })
})
