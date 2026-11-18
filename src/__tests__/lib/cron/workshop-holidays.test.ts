/**
 * The daily holiday refresh: every workshop with a country or a linked
 * calendar is read again, one failing does not stop the rest, and a workshop
 * being restored is left alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { appSetting: { findMany: vi.fn() } } }))
vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn((id: string) => id === 'org-restoring'),
}))
vi.mock('@/features/workshop-calendar/Lib/holidaySync.server', () => ({
  syncPublicHolidays: vi.fn(),
}))
vi.mock('@/features/workshop-calendar/Lib/feedSync.server', () => ({
  refreshLinkedFeeds: vi.fn(),
}))

import { db } from '@/lib/db'
import { syncPublicHolidays } from '@/features/workshop-calendar/Lib/holidaySync.server'
import { refreshLinkedFeeds } from '@/features/workshop-calendar/Lib/feedSync.server'
import { syncWorkshopHolidaysOnce } from '@/lib/cron/workshop-holidays'

beforeEach(() => {
  vi.clearAllMocks()
  // The failing workshop is logged; keep the test output quiet.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('daily holiday refresh', () => {
  it('refreshes each workshop once and carries on past one that fails', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { organizationId: 'org-au' },
      { organizationId: 'org-au' },
      { organizationId: 'org-broken' },
      { organizationId: 'org-restoring' },
      { organizationId: 'org-nz' },
    ] as never)
    vi.mocked(syncPublicHolidays).mockImplementation(async (id) => {
      if (id === 'org-broken') throw new Error('boom')
      return null
    })

    const synced = await syncWorkshopHolidaysOnce(new Date('2026-11-09T04:15:00Z'))

    expect(synced).toBe(2)
    expect(vi.mocked(syncPublicHolidays).mock.calls.map(([id]) => id)).toEqual([
      'org-au',
      'org-broken',
      'org-nz',
    ])
    expect(vi.mocked(refreshLinkedFeeds).mock.calls.map(([id]) => id)).toEqual(['org-au', 'org-nz'])
  })
})
