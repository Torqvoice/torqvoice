/**
 * Scheduled messages keep the workshop's clock, not the server's.
 *
 * The server runs in UTC. A repeating message must roll forward on the
 * workshop's wall clock (18:00 stays 18:00 across a DST change), and the
 * calendar's day window must cover whole workshop days.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendOrgMail: vi.fn(), getOrgFromAddress: vi.fn() }))
vi.mock('@/lib/sms', () => ({
  sendOrgSms: vi.fn(),
  getOrgSmsPhoneNumber: vi.fn(),
  normalizeOrgPhone: vi.fn(),
}))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('@/lib/whatsapp', () => ({ sendOrgWhatsapp: vi.fn() }))

// Plain functions, so a resetAllMocks in a beforeEach cannot blank them.
const zoneLookups: string[] = []
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: async (organizationId: string) => {
    zoneLookups.push(organizationId)
    return organizationId === 'org-oslo' ? 'Europe/Oslo' : 'UTC'
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    scheduledMessage: { findMany: vi.fn(), update: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { nextSendAt } from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'
import { processDueMessages } from '@/lib/cron/scheduled-messages'
import { getScheduledMessagesInRange } from '@/features/scheduled-messages/Actions/scheduledMessageActions'

function setupAuth(organizationId: string) {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

beforeEach(() => {
  vi.resetAllMocks()
  zoneLookups.length = 0
})

describe('nextSendAt', () => {
  it('keeps a daily 18:00 Oslo message at 18:00 across the October DST change', () => {
    // 24 Oct 2026 18:00 CEST is 16:00Z; the clocks go back overnight
    const before = new Date('2026-10-24T16:00:00Z')
    const next = nextSendAt(before, 'daily', null, 'Europe/Oslo')
    expect(next?.toISOString()).toBe('2026-10-25T17:00:00.000Z')
    // The server's own zone would have kept 16:00Z, which is 17:00 in Oslo
    expect(nextSendAt(before, 'daily', null, 'UTC')?.toISOString()).toBe('2026-10-25T16:00:00.000Z')
  })

  it('stops once the next slot is past the end date', () => {
    const start = new Date('2026-10-24T16:00:00Z')
    expect(nextSendAt(start, 'weekly', new Date('2026-10-30T00:00:00Z'), 'Europe/Oslo')).toBeNull()
    expect(nextSendAt(start, 'once', null, 'Europe/Oslo')).toBeNull()
  })
})

describe('processDueMessages', () => {
  it('rolls a repeating message forward on its workshop clock, one zone lookup per workshop', async () => {
    const base = {
      channel: 'in_app',
      subject: 'Reminder',
      body: 'Time for a service',
      recipient: null,
      organizationId: 'org-oslo',
      customerId: null,
      vehicleId: null,
      frequency: 'daily',
      endDate: null,
      runCount: 0,
    }
    vi.mocked(db.scheduledMessage.findMany).mockResolvedValue([
      { ...base, id: 'msg-1', sendAt: new Date('2026-10-24T16:00:00Z') },
      { ...base, id: 'msg-2', sendAt: new Date('2026-10-24T16:00:00Z') },
    ] as any)
    vi.mocked(db.scheduledMessage.update).mockResolvedValue({} as any)

    const sent = await processDueMessages(new Date('2026-10-24T16:00:30Z'))

    expect(sent).toBe(2)
    const updates = vi.mocked(db.scheduledMessage.update).mock.calls.map((c) => c[0].data)
    expect(updates[0].sendAt).toEqual(new Date('2026-10-25T17:00:00.000Z'))
    expect(updates[1].sendAt).toEqual(new Date('2026-10-25T17:00:00.000Z'))
    expect(zoneLookups).toEqual(['org-oslo'])
  })
})

describe('getScheduledMessagesInRange', () => {
  it('turns the day keys into a window of whole workshop days', async () => {
    setupAuth('org-oslo')
    vi.mocked(db.scheduledMessage.findMany).mockResolvedValue([] as any)

    const result = await getScheduledMessagesInRange({ start: '2026-09-01', end: '2026-09-30' })

    expect(result.success).toBe(true)
    const where = vi.mocked(db.scheduledMessage.findMany).mock.calls[0][0]?.where
    expect(where?.sendAt).toEqual({
      gte: new Date('2026-08-31T22:00:00.000Z'),
      lt: new Date('2026-09-30T22:00:00.000Z'),
    })
  })
})
