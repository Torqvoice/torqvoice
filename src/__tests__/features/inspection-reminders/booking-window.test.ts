/**
 * How far ahead online booking reads the workshop.
 *
 * A workshop can offer bookings eight weeks out. Jobs, closed days and leave
 * that far ahead have to be read too, or the page offers a closed day in
 * week eight and the confirmation lets the customer have it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    workBay: { findMany: vi.fn() },
    technician: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    inspection: { findMany: vi.fn() },
    appSetting: { findMany: vi.fn() },
  },
}))
vi.mock('@/features/workshop-calendar/Lib/loadCalendar.server', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/workshop-calendar/Lib/loadCalendar.server')
  >()),
  loadWorkshopCalendar: vi.fn(),
}))

import { db } from '@/lib/db'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { availabilityFor, claimableResource } from '@/features/inspection-reminders/Lib/booking'
import type { InspectionReminderSettings } from '@/features/inspection-reminders/Lib/settings'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import { zonedDate } from '@/lib/timezone'

const OSLO = 'Europe/Oslo'
const settings: InspectionReminderSettings = {
  durationMinutes: 60,
  leadDays: 1,
  horizonWeeks: 8,
  walkInReserve: 0,
  linkValidDays: 7,
  bookingMode: 'direct',
  phone: '',
  workshopName: 'Egeland Auto',
  templateSms: null,
  templateEmailSubject: null,
  templateEmailBody: null,
  workingHours: { start: '08:00', end: '16:00', includeWeekends: false, timeZone: OSLO },
  timeZone: OSLO,
  timeZoneDetected: false,
}
// Monday 9 November 2026; the staff trip is a Wednesday in week eight.
const now = zonedDate(2026, 11, 9, 10, 0, OSLO)
const TRIP = '2026-12-30'
const calendar = {
  timeZone: OSLO,
  week: defaultWeek('08:00', '16:00'),
  closures: [{ name: 'Staff trip', source: 'closure' as const, startDate: TRIP, endDate: TRIP }],
  absences: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.workBay.findMany).mockResolvedValue([{ id: 'bay-1' }] as never)
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([])
  vi.mocked(db.inspection.findMany).mockResolvedValue([])
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: 'workshop.timezone', value: OSLO },
  ] as never)
  vi.mocked(loadWorkshopCalendar).mockResolvedValue({ enabled: true, calendar })
})

describe('online booking eight weeks out', () => {
  it('reads closed days and jobs through the whole horizon', async () => {
    const { days } = await availabilityFor('org1', settings, now)
    const [, range] = vi.mocked(loadWorkshopCalendar).mock.calls[0]
    expect(range.to >= days.at(-1)?.date!).toBe(true)
    const jobsUntil = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0] as {
      where: { AND: { startDateTime: { lt: Date } }[] }
    }
    expect(jobsUntil.where.AND[0].startDateTime.lt >= zonedDate(2026, 12, 31, 0, 0, OSLO)).toBe(
      true
    )
    expect(days.find((d) => d.date === TRIP)).toMatchObject({
      status: 'closed',
      closedFor: 'Staff trip',
    })
  })

  it('refuses to confirm a time on a closed day in week eight', async () => {
    const start = zonedDate(2026, 12, 30, 9, 0, OSLO)
    expect(await claimableResource('org1', settings, start, now)).toBeNull()
    const [, range] = vi.mocked(loadWorkshopCalendar).mock.calls[0]
    expect(range.from <= TRIP && range.to >= TRIP).toBe(true)
  })
})
