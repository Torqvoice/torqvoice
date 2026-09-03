import { describe, expect, it } from 'vitest'
import { bookableDays, freeResources } from '@/features/inspection-reminders/Lib/booking'
import { nextSendTime } from '@/features/inspection-reminders/Lib/campaign'
import {
  GRACE_DAYS_AFTER_DUE,
  bookingUrl,
  linkExpiry,
} from '@/features/inspection-reminders/Lib/links'
import { zonedDate, zonedParts } from '@/lib/timezone'
import type { InspectionReminderSettings } from '@/features/inspection-reminders/Lib/settings'
import {
  renderTemplate,
  smsSegments,
  unknownPlaceholders,
} from '@/features/inspection-reminders/Lib/template'

const DAY = 86_400_000

const settings: InspectionReminderSettings = {
  durationMinutes: 60,
  leadDays: 1,
  horizonWeeks: 1,
  walkInReserve: 0,
  linkValidDays: 7,
  bookingMode: 'direct',
  phone: '+47 12345678',
  workshopName: 'Egeland Auto',
  templateSms: null,
  templateEmailSubject: null,
  templateEmailBody: null,
  workingHours: { start: '08:00', end: '12:00', includeWeekends: false, timeZone: 'Europe/Oslo' },
  timeZone: 'Europe/Oslo',
  timeZoneDetected: false,
}

const OSLO = 'Europe/Oslo'
const oslo = (y: number, m: number, d: number, h: number, min = 0) =>
  zonedDate(y, m, d, h, min, OSLO)
const hourIn = (iso: string) => zonedParts(new Date(iso), OSLO).hour

describe('reminder template', () => {
  it('fills known placeholders and leaves unknown ones visible', () => {
    const out = renderTemplate(
      'Hi {customerName}, {vehicle} ({plate}) is due {dueDate}. {bookingLink} {oops}',
      {
        customerName: 'Kari',
        vehicle: '2019 Volvo V90',
        plate: 'EV11223',
        dueDate: '31 March 2027',
        workshopName: 'Egeland Auto',
        bookingLink: 'https://app.test/b/abc',
        phone: '',
      }
    )
    expect(out).toBe(
      'Hi Kari, 2019 Volvo V90 (EV11223) is due 31 March 2027. https://app.test/b/abc {oops}'
    )
    expect(unknownPlaceholders('{customerName} {oops} {phone}')).toEqual(['oops'])
  })

  it('counts SMS segments by character set', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1)
    expect(smsSegments('a'.repeat(161))).toBe(2)
    expect(smsSegments('ø'.repeat(70))).toBe(1)
    expect(smsSegments('Ærlig talt 😀')).toBe(1)
    expect(smsSegments('😀'.repeat(71))).toBe(2)
  })
})

describe('booking link', () => {
  it('stays open at least seven days and past the deadline', () => {
    const sent = new Date('2026-09-03T08:00:00Z')
    const nearDue = new Date('2026-09-05T00:00:00Z')
    expect(linkExpiry(sent, nearDue, 7).getTime()).toBe(
      Math.max(sent.getTime() + 7 * DAY, nearDue.getTime() + GRACE_DAYS_AFTER_DUE * DAY)
    )
    const farDue = new Date('2026-12-01T00:00:00Z')
    expect(linkExpiry(sent, farDue, 7).getTime()).toBe(
      farDue.getTime() + GRACE_DAYS_AFTER_DUE * DAY
    )
    // A workshop typing 2 still gets the minimum.
    expect(linkExpiry(sent, nearDue, 2).getTime()).toBeGreaterThanOrEqual(sent.getTime() + 7 * DAY)
    expect(bookingUrl('https://app.test/', 'abc')).toBe('https://app.test/b/abc')
  })
})

describe('booking availability', () => {
  // A Wednesday at 15:00 on the shop's clock, whatever zone the test runs in.
  const now = oslo(2026, 9, 2, 15)
  const resources = [{ workBayId: 'bay-1' }, { workBayId: 'bay-2' }]

  it('never offers today, skips weekends, and reads opening hours on the shop clock', () => {
    const days = bookableDays({ now, settings, resources, bookings: [] })
    expect(days[0].date).toBe('2026-09-03')
    const weekend = days.filter((d) => d.date === '2026-09-05' || d.date === '2026-09-06')
    expect(weekend.every((d) => d.status === 'closed')).toBe(true)
    // 08:00 to 12:00 with an hour's slot on a half-hour grid: 08:00 … 11:00.
    expect(days[0].starts).toHaveLength(7)
    expect(hourIn(days[0].starts[0])).toBe(8)
    // 08:00 in Oslo in September is 06:00 UTC: the instant, not the server's idea of 08:00.
    expect(days[0].starts[0]).toBe('2026-09-03T06:00:00.000Z')
  })

  it('hides a start once every bay is taken, and keeps the walk-in reserve', () => {
    const start = oslo(2026, 9, 3, 8)
    const end = oslo(2026, 9, 3, 9)
    const bookings = [
      {
        id: 'a',
        kind: 'serviceRecord' as const,
        label: 'x',
        start,
        end,
        technicianId: null,
        workBayId: 'bay-1',
      },
      {
        id: 'b',
        kind: 'serviceRecord' as const,
        label: 'y',
        start,
        end,
        technicianId: null,
        workBayId: 'bay-2',
      },
    ]
    expect(freeResources(start, 60, resources, bookings)).toHaveLength(0)
    const days = bookableDays({ now, settings, resources, bookings })
    const thursday = days.find((d) => d.date === '2026-09-03')
    expect(thursday?.starts.map(hourIn)).not.toContain(8)
    // 08:30 overlaps the 08:00 bookings, so it is gone too; 09:00 is the first free start.
    expect(hourIn(thursday?.starts[0] as string)).toBe(9)

    const reserved = bookableDays({
      now,
      settings: { ...settings, walkInReserve: 1 },
      resources,
      bookings: [bookings[0]],
    })
    const thu = reserved.find((d) => d.date === '2026-09-03')
    // One bay busy at 08:00 leaves one free, which the reserve keeps back.
    expect(hourIn(thu?.starts[0] as string)).toBe(9)
  })

  it('reports a fully booked day as full', () => {
    const bookings = resources.map((r, i) => ({
      id: String(i),
      kind: 'serviceRecord' as const,
      label: 't',
      start: oslo(2026, 9, 3, 8),
      end: oslo(2026, 9, 3, 12),
      technicianId: null,
      workBayId: r.workBayId,
    }))
    const days = bookableDays({ now, settings, resources, bookings })
    expect(days.find((d) => d.date === '2026-09-03')?.status).toBe('full')
  })
})

describe('send time', () => {
  const hours = { start: '07:00', end: '15:00', includeWeekends: false, timeZone: OSLO }
  it('sends now during opening hours and next morning after closing, on the shop clock', () => {
    const open = oslo(2026, 9, 2, 10)
    expect(nextSendTime(open, hours)).toBe(open)
    const late = oslo(2026, 9, 2, 23)
    const next = nextSendTime(late, hours)
    expect(zonedParts(next, OSLO)).toMatchObject({ day: 3, hour: 7, minute: 0 })
    expect(next.toISOString()).toBe('2026-09-03T05:00:00.000Z')
    // Friday night rolls to Monday.
    const friday = oslo(2026, 9, 4, 16)
    expect(zonedParts(nextSendTime(friday, hours), OSLO).weekday).toBe(1)
  })
})
