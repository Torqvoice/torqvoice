/**
 * Which work orders the reports count: every job in the window, or with
 * "completed only" switched on, only those marked completed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getRevenueReport, getServiceReport } from '@/features/reports/Actions/reportActions'
import { parseCompletedOnlyCookie } from '@/lib/completed-only-preference'

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

const whereOf = () => (vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as any).where

beforeEach(() => {
  vi.resetAllMocks()
  setupAuth()
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([])
})

describe('reports', () => {
  it('count every job when the switch is off', async () => {
    await getRevenueReport({ startDate: '2026-01-01', endDate: '2026-01-31' })
    expect(whereOf().status).toBeUndefined()
  })

  it('count only completed jobs when the switch is on', async () => {
    await getServiceReport({ startDate: '2026-01-01', endDate: '2026-01-31', completedOnly: true })
    expect(whereOf().status).toBe('completed')
  })
})

describe('the remembered switch', () => {
  it('reads the pages it is on for and ignores anything else', () => {
    expect([...parseCompletedOnlyCookie('billing,reports')]).toEqual(['billing', 'reports'])
    expect([...parseCompletedOnlyCookie('reports,whatever')]).toEqual(['reports'])
    expect(parseCompletedOnlyCookie(undefined).size).toBe(0)
  })
})
