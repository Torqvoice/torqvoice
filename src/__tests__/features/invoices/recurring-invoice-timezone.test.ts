/**
 * Recurring invoices read their dates as workshop days and step on the
 * workshop's clock, whatever zone the server runs in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
// A plain function, so a resetAllMocks in a beforeEach cannot blank it.
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Europe/Oslo' }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    appSetting: { findMany: vi.fn() },
    recurringInvoice: { create: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { calculateNextRunDate } from '@/lib/cron/recurring-invoices'
import { createRecurringInvoice } from '@/features/billing/Actions/recurringInvoiceActions'

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
  // No tax settings: the template inherits an exclusive, single-rate default.
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('calculateNextRunDate', () => {
  it('keeps workshop midnight across the October DST change', () => {
    // 1 Oct 2026 00:00 CEST is 30 Sep 22:00Z; 1 Nov 00:00 CET is 31 Oct 23:00Z
    const oct1 = new Date('2026-09-30T22:00:00Z')
    expect(calculateNextRunDate(oct1, 'monthly', 'Europe/Oslo').toISOString()).toBe(
      '2026-10-31T23:00:00.000Z'
    )
    expect(calculateNextRunDate(oct1, 'weekly', 'Europe/Oslo').toISOString()).toBe(
      '2026-10-07T22:00:00.000Z'
    )
    expect(calculateNextRunDate(oct1, 'quarterly', 'Europe/Oslo').toISOString()).toBe(
      '2026-12-31T23:00:00.000Z'
    )
  })
})

describe('createRecurringInvoice', () => {
  it('reads the start and end days on the workshop clock', async () => {
    setupAuth()
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-1' } as any)
    vi.mocked(db.recurringInvoice.create).mockImplementation((async ({ data }: any) => ({
      id: 'ri-1',
      ...data,
    })) as any)

    const result = await createRecurringInvoice({
      title: 'Storage',
      frequency: 'monthly',
      nextRunDate: '2026-10-01',
      endDate: '2026-12-31',
      vehicleId: 'veh-1',
      taxInclusive: false,
    } as any)

    expect(result.success).toBe(true)
    const data = vi.mocked(db.recurringInvoice.create).mock.calls[0][0].data
    expect(data.nextRunDate).toEqual(new Date('2026-09-30T22:00:00.000Z'))
    expect(data.endDate).toEqual(new Date('2026-12-31T22:59:59.999Z'))
  })
})
