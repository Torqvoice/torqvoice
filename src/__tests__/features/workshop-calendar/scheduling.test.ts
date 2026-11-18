/**
 * How the workshop calendar changes scheduling: the next free slot the desk
 * is offered, a technician's load on the board, and the days a customer may
 * book online.
 *
 * Staff are never refused (those paths only warn); online booking is, so a
 * customer is never offered a holiday, a closed weekday or a technician who
 * is away.
 */

import { describe, it, expect } from 'vitest'
import { zonedDate, zonedParts } from '@/lib/timezone'
import {
  absenceBookings,
  findConflicts,
  nextAvailableSlot,
  technicianMinutesInDay,
  withinWorkingHours,
} from '@/features/workboard/Lib/availability'
import { bookableDays } from '@/features/inspection-reminders/Lib/booking'
import type { InspectionReminderSettings } from '@/features/inspection-reminders/Lib/settings'
import { type WorkshopCalendar, defaultWeek } from '@/features/workshop-calendar/Lib/calendar'

const OSLO = 'Europe/Oslo'
const oslo = (y: number, m: number, d: number, h: number, min = 0) =>
  zonedDate(y, m, d, h, min, OSLO)
const hhmm = (d: Date) => {
  const p = zonedParts(d, OSLO)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
const dayOfMonth = (d: Date) => zonedParts(d, OSLO).day

function calendar(over: Partial<WorkshopCalendar> = {}): WorkshopCalendar {
  return {
    timeZone: OSLO,
    week: defaultWeek('08:00', '16:00'),
    closures: [],
    absences: [],
    ...over,
  }
}

const hoursWith = (cal: WorkshopCalendar) => ({
  start: '08:00',
  end: '16:00',
  timeZone: OSLO,
  calendar: cal,
})

// Thursday 24 December 2026 and the days around it.
const christmas = calendar({
  closures: [
    {
      name: 'Julaften',
      source: 'holiday',
      startDate: '2026-12-24',
      endDate: '2026-12-24',
      startTime: '12:00',
    },
    { name: 'Første juledag', source: 'holiday', startDate: '2026-12-25', endDate: '2026-12-25' },
  ],
})

describe('next free slot', () => {
  it('skips a public holiday and the hours closed on the day before', () => {
    // From 11:30 on Christmas Eve, a two hour job no longer fits before 12:00;
    // the 25th is a holiday and the 26th and 27th a weekend.
    const slot = nextAvailableSlot({
      from: oslo(2026, 12, 24, 11, 30),
      durationMinutes: 120,
      bookings: [],
      hours: hoursWith(christmas),
    })
    expect(slot && dayOfMonth(slot.start)).toBe(28)
    expect(slot && hhmm(slot.start)).toBe('08:00')
  })

  it('offers a Saturday when the workshop opens on Saturdays', () => {
    const week = defaultWeek('08:00', '16:00')
    week[6] = { open: true, start: '09:00', end: '13:00' }
    const slot = nextAvailableSlot({
      from: oslo(2026, 11, 13, 17, 0), // Friday after closing
      durationMinutes: 60,
      bookings: [],
      hours: hoursWith(calendar({ week })),
    })
    expect(slot && dayOfMonth(slot.start)).toBe(14)
    expect(slot && hhmm(slot.start)).toBe('09:00')
  })

  it('does not book a technician while they are away, and says why in a clash', () => {
    const cal = calendar({
      absences: [
        {
          id: 'a1',
          technicianId: 'kari',
          startDate: '2026-11-16',
          endDate: '2026-11-17',
          reason: 'holiday',
        },
      ],
    })
    const bookings = absenceBookings(cal)
    const slot = nextAvailableSlot({
      from: oslo(2026, 11, 16, 7, 0),
      durationMinutes: 60,
      bookings,
      hours: hoursWith(cal),
      technicianId: 'kari',
    })
    expect(slot && dayOfMonth(slot.start)).toBe(18)

    // Someone else is free that Monday, and Kari's leave is named as the clash.
    expect(
      nextAvailableSlot({
        from: oslo(2026, 11, 16, 7, 0),
        durationMinutes: 60,
        bookings,
        hours: hoursWith(cal),
        technicianId: 'ola',
      })?.start
    ).toEqual(oslo(2026, 11, 16, 8, 0))
    const clash = findConflicts(
      { start: oslo(2026, 11, 16, 9), end: oslo(2026, 11, 16, 10), technicianId: 'kari' },
      bookings
    )
    expect(clash).toMatchObject([{ kind: 'absence', label: 'holiday' }])
  })

  it('counts time away as away, not as booked work, on the board', () => {
    const cal = calendar({
      absences: [
        {
          id: 'a1',
          technicianId: 'kari',
          startDate: '2026-11-16',
          endDate: '2026-11-16',
          reason: 'sick',
        },
      ],
    })
    const load = technicianMinutesInDay(
      absenceBookings(cal),
      oslo(2026, 11, 16, 0),
      oslo(2026, 11, 17, 0)
    )
    expect(load).toEqual({})
  })

  it('treats a slot on a holiday as outside working hours', () => {
    const slot = { start: oslo(2026, 12, 25, 9), end: oslo(2026, 12, 25, 10) }
    expect(withinWorkingHours(slot, hoursWith(christmas))).toBe(false)
    expect(
      withinWorkingHours(
        { start: oslo(2026, 12, 24, 9), end: oslo(2026, 12, 24, 10) },
        hoursWith(christmas)
      )
    ).toBe(true)
  })
})

describe('online booking', () => {
  const settings: InspectionReminderSettings = {
    durationMinutes: 60,
    leadDays: 1,
    horizonWeeks: 1,
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
  const now = oslo(2026, 12, 22, 10)

  it('closes a public holiday with its name, and shortens the day before it', () => {
    const days = bookableDays({
      now,
      settings,
      resources: [{ workBayId: 'bay-1' }],
      bookings: [],
      calendar: christmas,
    })
    const eve = days.find((d) => d.date === '2026-12-24')
    const day = days.find((d) => d.date === '2026-12-25')
    expect(day).toMatchObject({ status: 'closed', starts: [], closedFor: 'Første juledag' })
    // 08:00 to 12:00 with an hour's slot on the half-hour grid: 08:00 to 11:00.
    expect(eve?.starts.map((s) => hhmm(new Date(s)))).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
    ])
  })

  it('offers no time when the only technician is on leave', () => {
    const cal = calendar({
      absences: [
        {
          id: 'a1',
          technicianId: 'kari',
          startDate: '2026-12-23',
          endDate: '2026-12-23',
          reason: 'holiday',
        },
      ],
    })
    const days = bookableDays({
      now,
      settings,
      resources: [{ technicianId: 'kari' }],
      bookings: absenceBookings(cal),
      calendar: cal,
    })
    expect(days.find((d) => d.date === '2026-12-23')?.status).toBe('full')
    expect(days.find((d) => d.date === '2026-12-28')?.status).toBe('open')
  })

  it('lets a customer book a Saturday when the workshop opens then', () => {
    const week = defaultWeek('08:00', '16:00')
    week[6] = { open: true, start: '09:00', end: '12:00' }
    const days = bookableDays({
      now,
      settings,
      resources: [{ workBayId: 'bay-1' }],
      bookings: [],
      calendar: calendar({ week }),
    })
    const saturday = days.find((d) => d.date === '2026-12-26')
    expect(saturday?.status).toBe('open')
    expect(hhmm(new Date(saturday?.starts[0] as string))).toBe('09:00')
    expect(days.find((d) => d.date === '2026-12-27')?.status).toBe('closed')
  })
})
