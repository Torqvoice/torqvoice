/**
 * When the workshop is open and who is away: the rules every screen reads.
 *
 * A wrong answer here offers a customer Christmas Day, books a technician who
 * is on leave, or shades the wrong hours on the board, so the edges are
 * tested: a closure over New Year, part of a day, 29 February, the night the
 * clocks change.
 */

import { describe, it, expect } from 'vitest'
import {
  type WorkshopCalendar,
  absencesDuring,
  addDays,
  awayAllDay,
  closuresDuring,
  dayState,
  defaultWeek,
  isOpenFor,
  openIntervalsOn,
  parseWeekHours,
  repeatYearly,
  weekSpan,
} from '@/features/workshop-calendar/Lib/calendar'
import { closedDay, awayDay } from '@/features/workshop-calendar/Lib/boardDays'
import { formatDays } from '@/features/workshop-calendar/Lib/format'

const ZONE = 'Australia/Brisbane' // UTC+10, no daylight saving

function cal(over: Partial<WorkshopCalendar> = {}): WorkshopCalendar {
  return {
    timeZone: ZONE,
    week: defaultWeek('08:00', '17:00'),
    closures: [],
    absences: [],
    ...over,
  }
}

/** "HH:mm" of an instant on the workshop's clock. */
const clock = (d: Date, zone = ZONE) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(d)

describe('opening hours', () => {
  it('opens weekdays only by default, like the single work day did', () => {
    const week = defaultWeek('07:00', '15:00')
    expect(week.map((d) => d.open)).toEqual([false, true, true, true, true, true, false])
  })

  it('reads a stored week, and keeps the fallback for anything unusable', () => {
    const fallback = defaultWeek('07:00', '15:00')
    const stored = JSON.stringify([
      { open: true, start: '09:00', end: '13:00' }, // Sunday open
      { open: true, start: '07:30', end: '16:00' },
      { open: true, start: '25:00', end: '16:00' }, // broken time: fallback times, still open
      { open: true, start: '16:00', end: '08:00' }, // back to front: closed
      null,
      { open: false, start: '07:00', end: '15:00' },
      { open: true, start: '08:00', end: '12:00' }, // Saturday morning
    ])
    const week = parseWeekHours(stored, fallback)
    expect(week[0]).toEqual({ open: true, start: '09:00', end: '13:00' })
    expect(week[1]).toEqual({ open: true, start: '07:30', end: '16:00' })
    expect(week[2]).toEqual({ open: true, start: '07:00', end: '16:00' })
    expect(week[3].open).toBe(false)
    expect(week[4]).toEqual(fallback[4])
    expect(week[5].open).toBe(false)
    expect(week[6]).toEqual({ open: true, start: '08:00', end: '12:00' })
    expect(parseWeekHours('not json', fallback)).toBe(fallback)
    expect(parseWeekHours(JSON.stringify([1, 2]), fallback)).toBe(fallback)
  })

  it('spans the earliest opening to the latest closing for drawing the board', () => {
    const week = defaultWeek('08:00', '17:00')
    week[6] = { open: true, start: '07:00', end: '12:00' }
    expect(weekSpan(week)).toEqual({ start: '07:00', end: '17:00' })
  })

  it('opens on a Saturday when the week says so', () => {
    const week = defaultWeek('08:00', '17:00')
    week[6] = { open: true, start: '08:00', end: '12:00' }
    const intervals = openIntervalsOn(cal({ week }), '2026-11-14') // a Saturday
    expect(intervals.map((i) => [clock(i.start), clock(i.end)])).toEqual([['08:00', '12:00']])
    expect(openIntervalsOn(cal(), '2026-11-14')).toEqual([])
  })
})

describe('closures', () => {
  const christmas = {
    name: 'Christmas Day',
    source: 'holiday' as const,
    startDate: '2026-12-25',
    endDate: '2026-12-25',
  }

  it('closes the whole day for a holiday, and names it', () => {
    const state = dayState(cal({ closures: [christmas] }), '2026-12-25')
    expect(state.open).toBe(false)
    expect(state.closedWeekday).toBe(false)
    expect(state.closures.map((c) => c.name)).toEqual(['Christmas Day'])
  })

  it('names a holiday once when the public holidays and a calendar both list it', () => {
    const fromFeed = { ...christmas, name: 'christmas day', source: 'feed' as const }
    const both = cal({ closures: [christmas, fromFeed] })
    expect(dayState(both, '2026-12-25').closures.map((c) => c.name)).toEqual(['Christmas Day'])
    const day = { start: new Date('2026-12-25T00:00:00Z'), end: new Date('2026-12-25T23:00:00Z') }
    expect(closuresDuring(both, day.start, day.end).map((c) => c.name)).toEqual(['Christmas Day'])
  })

  it('shortens a day closed from a time, and says it is shortened', () => {
    const eve = {
      ...christmas,
      name: 'Christmas Eve',
      startDate: '2026-12-24',
      endDate: '2026-12-24',
      startTime: '12:00',
    }
    const state = dayState(cal({ closures: [eve] }), '2026-12-24')
    expect(state.open).toBe(true)
    expect(state.shortened).toBe(true)
    expect(state.intervals.map((i) => [clock(i.start), clock(i.end)])).toEqual([['08:00', '12:00']])
  })

  it('takes a closure from the middle of a day, leaving morning and afternoon', () => {
    const lunch = {
      ...christmas,
      name: 'Staff meeting',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      startTime: '11:00',
      endTime: '13:00',
    }
    const intervals = openIntervalsOn(cal({ closures: [lunch] }), '2026-11-10')
    expect(intervals.map((i) => [clock(i.start), clock(i.end)])).toEqual([
      ['08:00', '11:00'],
      ['13:00', '17:00'],
    ])
  })

  it('closes every day of a stretch, with its times on the first and last day only', () => {
    const shutdown = {
      ...christmas,
      name: 'Shutdown',
      startDate: '2026-12-23',
      endDate: '2026-12-29',
      startTime: '14:00',
      endTime: '10:00',
    }
    const c = cal({ closures: [shutdown] })
    expect(openIntervalsOn(c, '2026-12-23').map((i) => clock(i.end))).toEqual(['14:00'])
    expect(openIntervalsOn(c, '2026-12-28')).toEqual([])
    expect(openIntervalsOn(c, '2026-12-29').map((i) => clock(i.start))).toEqual(['10:00'])
  })

  it('knows whether a booked slot is open, and which closures it falls in', () => {
    const c = cal({ closures: [christmas] })
    const at = (key: string, hh: string) => new Date(`${key}T${hh}:00+10:00`)
    expect(isOpenFor(c, at('2026-12-24', '09:00'), at('2026-12-24', '10:00'))).toBe(true)
    expect(isOpenFor(c, at('2026-12-24', '16:30'), at('2026-12-24', '17:30'))).toBe(false)
    expect(isOpenFor(c, at('2026-12-25', '09:00'), at('2026-12-25', '10:00'))).toBe(false)
    expect(
      closuresDuring(c, at('2026-12-25', '09:00'), at('2026-12-25', '10:00')).map((x) => x.name)
    ).toEqual(['Christmas Day'])
  })
})

describe('repeating every year', () => {
  it('moves a closure to each year and keeps a stretch over New Year whole', () => {
    const period = {
      name: 'Summer shutdown',
      source: 'closure' as const,
      startDate: '2024-12-24',
      endDate: '2025-01-02',
    }
    const repeats = repeatYearly(period, 2026, 2027)
    expect(repeats.map((p) => [p.startDate, p.endDate])).toEqual([
      ['2026-12-24', '2027-01-02'],
      ['2027-12-24', '2028-01-02'],
    ])
  })

  it('puts 29 February on the 28th in a year without it', () => {
    const leap = {
      name: 'Leap day',
      source: 'closure' as const,
      startDate: '2024-02-29',
      endDate: '2024-02-29',
    }
    expect(repeatYearly(leap, 2026, 2028).map((p) => p.startDate)).toEqual([
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
  })
})

describe('a day the clocks change', () => {
  it('keeps the hours on the wall clock in Oslo when summer time starts', () => {
    // 29 March 2026: clocks go from 02:00 to 03:00 in Europe/Oslo.
    const c = cal({ timeZone: 'Europe/Oslo', week: defaultWeek('08:00', '16:00', true) })
    const [open] = openIntervalsOn(c, '2026-03-29')
    expect(clock(open.start, 'Europe/Oslo')).toBe('08:00')
    expect(clock(open.end, 'Europe/Oslo')).toBe('16:00')
    expect(open.end.getTime() - open.start.getTime()).toBe(8 * 3600_000)
    // The board lays the day out by its clock, so the shut hours sit at
    // 00:00-08:00 and 16:00-24:00 even on a 23-hour day.
    expect(closedDay(c, '2026-03-29').spans).toEqual([
      { startMins: 0, endMins: 8 * 60 },
      { startMins: 16 * 60, endMins: 24 * 60 },
    ])
  })

  it('draws leave at its own clock time on both nights the clocks change', () => {
    const c = cal({
      timeZone: 'Europe/Oslo',
      week: defaultWeek('08:00', '16:00', true),
      absences: [
        {
          id: 'spring',
          technicianId: 'tech-1',
          reason: 'holiday',
          startDate: '2026-03-29',
          endDate: '2026-03-29',
          startTime: '13:00',
        },
        {
          id: 'autumn',
          technicianId: 'tech-1',
          reason: 'holiday',
          startDate: '2026-10-25',
          endDate: '2026-10-25',
          startTime: '13:00',
        },
      ],
    })
    expect(awayDay(c, 'tech-1', '2026-03-29')?.spans).toEqual([
      { startMins: 13 * 60, endMins: 24 * 60 },
    ])
    expect(awayDay(c, 'tech-1', '2026-10-25')?.spans).toEqual([
      { startMins: 13 * 60, endMins: 24 * 60 },
    ])
  })
})

describe('time off', () => {
  const leave = {
    id: 'a1',
    technicianId: 'tech-1',
    startDate: '2026-11-16',
    endDate: '2026-11-20',
    reason: 'holiday',
  }
  const doctor = {
    id: 'a2',
    technicianId: 'tech-2',
    startDate: '2026-11-17',
    endDate: '2026-11-17',
    startTime: '13:00',
    endTime: '15:00',
    reason: 'other',
  }

  it('finds who is away during a slot, and only them', () => {
    const c = cal({ absences: [leave, doctor] })
    const at = (key: string, hh: string) => new Date(`${key}T${hh}:00+10:00`)
    expect(
      absencesDuring(c, 'tech-1', at('2026-11-18', '09:00'), at('2026-11-18', '10:00'))
    ).toHaveLength(1)
    expect(
      absencesDuring(c, 'tech-2', at('2026-11-17', '09:00'), at('2026-11-17', '10:00'))
    ).toHaveLength(0)
    expect(
      absencesDuring(c, 'tech-2', at('2026-11-17', '14:00'), at('2026-11-17', '16:00'))
    ).toHaveLength(1)
  })

  it('tells a whole day away from part of one', () => {
    const c = cal({ absences: [leave, doctor] })
    expect(awayAllDay(c, leave, '2026-11-18')).toBe(true)
    expect(awayAllDay(c, doctor, '2026-11-17')).toBe(false)
    const part = awayDay(c, 'tech-2', '2026-11-17')
    expect(part?.allDay).toBe(false)
    expect(part?.spans).toEqual([{ startMins: 13 * 60, endMins: 15 * 60 }])
    expect(awayDay(c, 'tech-2', addDays('2026-11-17', 1))).toBeNull()
  })
})

describe('dates for people to read', () => {
  it('writes a range with plain spaces, so the server and the browser agree', () => {
    const range = formatDays('2026-11-16', '2026-11-17', 'en', { weekday: true })
    expect(range).toBe('Mon, Nov 16 – Tue, Nov 17, 2026')
    expect(range).not.toMatch(/[\u2009\u202f]/)
  })
})
