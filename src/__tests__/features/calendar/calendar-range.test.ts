import { describe, expect, it } from 'vitest'
import {
  addMonths,
  eventSpan,
  getMonthGridDays,
  isoWeekNumber,
  layoutTimedEvents,
  parseDateKey,
  rangeCovers,
  shiftDate,
  startOfWeek,
  timeToMinutes,
  toLocalDateStr,
  visibleRange,
} from '@/features/calendar/Lib/calendar-range'

const d = (s: string) => parseDateKey(s)!

describe('parseDateKey', () => {
  it('reads YYYY-MM-DD as a local date', () => {
    const date = parseDateKey('2026-09-06')!
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(6)
    expect(date.getHours()).toBe(0)
  })

  it('rejects anything else', () => {
    expect(parseDateKey('2026-9-6')).toBeNull()
    expect(parseDateKey('tomorrow')).toBeNull()
    expect(parseDateKey('')).toBeNull()
    expect(parseDateKey(undefined)).toBeNull()
  })

  it('round-trips through toLocalDateStr', () => {
    expect(toLocalDateStr(d('2026-01-31'))).toBe('2026-01-31')
  })
})

describe('startOfWeek', () => {
  it('honours a Monday start', () => {
    // 6 Sep 2026 is a Sunday
    expect(toLocalDateStr(startOfWeek(d('2026-09-06'), 1))).toBe('2026-08-31')
  })

  it('honours a Sunday start', () => {
    expect(toLocalDateStr(startOfWeek(d('2026-09-06'), 0))).toBe('2026-09-06')
  })

  it('honours a Saturday start', () => {
    expect(toLocalDateStr(startOfWeek(d('2026-09-06'), 6))).toBe('2026-09-05')
  })
})

describe('getMonthGridDays', () => {
  it('pads to whole weeks from the week start', () => {
    const days = getMonthGridDays(2026, 8, 1) // September 2026, Monday start
    expect(days.length % 7).toBe(0)
    expect(toLocalDateStr(days[0])).toBe('2026-08-31')
    expect(toLocalDateStr(days[days.length - 1])).toBe('2026-10-04')
  })

  it('needs six rows for a month that spills far', () => {
    // May 2026 starts on a Friday and has 31 days: Monday start needs 5 rows
    expect(getMonthGridDays(2026, 4, 1).length).toBe(35)
    // August 2026 starts on a Saturday: 6 rows
    expect(getMonthGridDays(2026, 7, 1).length).toBe(42)
  })
})

describe('addMonths', () => {
  it('clamps the day at the end of a shorter month', () => {
    expect(toLocalDateStr(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28')
    expect(toLocalDateStr(addMonths(d('2026-03-31'), -1))).toBe('2026-02-28')
  })

  it('crosses the year', () => {
    expect(toLocalDateStr(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15')
  })
})

describe('visibleRange', () => {
  it('day is the day', () => {
    const r = visibleRange('day', d('2026-09-06'), 1)
    expect(toLocalDateStr(r.start)).toBe('2026-09-06')
    expect(toLocalDateStr(r.end)).toBe('2026-09-06')
  })

  it('four days start on the date', () => {
    const r = visibleRange('fourDays', d('2026-09-06'), 1)
    expect(toLocalDateStr(r.end)).toBe('2026-09-09')
  })

  it('week snaps to the week start', () => {
    const r = visibleRange('week', d('2026-09-06'), 1)
    expect(toLocalDateStr(r.start)).toBe('2026-08-31')
    expect(toLocalDateStr(r.end)).toBe('2026-09-06')
  })

  it('month and schedule show the padded grid', () => {
    for (const view of ['month', 'schedule'] as const) {
      const r = visibleRange(view, d('2026-09-06'), 1)
      expect(toLocalDateStr(r.start)).toBe('2026-08-31')
      expect(toLocalDateStr(r.end)).toBe('2026-10-04')
    }
  })

  it('year is the calendar year', () => {
    const r = visibleRange('year', d('2026-09-06'), 1)
    expect(toLocalDateStr(r.start)).toBe('2026-01-01')
    expect(toLocalDateStr(r.end)).toBe('2026-12-31')
  })
})

describe('shiftDate', () => {
  it('moves by the size of the view', () => {
    const base = d('2026-09-06')
    expect(toLocalDateStr(shiftDate('day', base, 1))).toBe('2026-09-07')
    expect(toLocalDateStr(shiftDate('fourDays', base, 1))).toBe('2026-09-10')
    expect(toLocalDateStr(shiftDate('week', base, -1))).toBe('2026-08-30')
    expect(toLocalDateStr(shiftDate('month', base, 1))).toBe('2026-10-06')
    expect(toLocalDateStr(shiftDate('schedule', base, -1))).toBe('2026-08-06')
    expect(toLocalDateStr(shiftDate('year', base, 1))).toBe('2027-09-06')
  })

  it('keeps a leap day sane when jumping a year', () => {
    expect(toLocalDateStr(shiftDate('year', d('2028-02-29'), 1))).toBe('2029-02-28')
  })
})

describe('rangeCovers', () => {
  const outer = { start: d('2026-08-31'), end: d('2026-10-04') }
  it('is true when the inner range fits', () => {
    expect(rangeCovers(outer, { start: d('2026-09-07'), end: d('2026-09-13') })).toBe(true)
  })
  it('is false when the inner range spills', () => {
    expect(rangeCovers(outer, { start: d('2026-10-03'), end: d('2026-10-06') })).toBe(false)
    expect(rangeCovers(null, { start: d('2026-09-07'), end: d('2026-09-13') })).toBe(false)
  })
})

describe('isoWeekNumber', () => {
  it('matches ISO 8601', () => {
    expect(isoWeekNumber(d('2026-01-01'))).toBe(1)
    expect(isoWeekNumber(d('2027-01-01'))).toBe(53)
    expect(isoWeekNumber(d('2026-09-06'))).toBe(36)
  })
})

describe('eventSpan', () => {
  it('is null for an all-day item', () => {
    expect(eventSpan({ type: 'reminder', time: null })).toBeNull()
  })

  it('uses the record end when it has one', () => {
    expect(eventSpan({ type: 'service', time: '09:00', endTime: '11:30' })).toEqual({
      startMins: 540,
      endMins: 690,
    })
  })

  it('falls back to a default length per type', () => {
    expect(eventSpan({ type: 'service', time: '09:00' })!.endMins).toBe(600)
    expect(eventSpan({ type: 'message', time: '09:00' })!.endMins).toBe(570)
  })

  it('never ends before it starts', () => {
    expect(eventSpan({ type: 'service', time: '09:00', endTime: '08:00' })!.endMins).toBe(600)
  })

  it('reads clock strings defensively', () => {
    expect(timeToMinutes('7:05')).toBe(425)
    expect(timeToMinutes('nope')).toBe(0)
    expect(timeToMinutes(null)).toBe(0)
  })
})

describe('layoutTimedEvents', () => {
  const item = (id: string, start: number, end: number) => ({
    item: id,
    span: { startMins: start, endMins: end },
  })

  it('gives non-overlapping events the full width', () => {
    const out = layoutTimedEvents([item('a', 540, 600), item('b', 600, 660)])
    expect(out.map((p) => [p.item, p.column, p.columns])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  it('splits a double booking side by side', () => {
    const out = layoutTimedEvents([item('a', 540, 660), item('b', 570, 630), item('c', 600, 720)])
    const byId = Object.fromEntries(out.map((p) => [p.item, p]))
    expect(byId.a.columns).toBe(3)
    expect(byId.b.columns).toBe(3)
    expect(byId.c.columns).toBe(3)
    expect(new Set([byId.a.column, byId.b.column, byId.c.column]).size).toBe(3)
  })

  it('reuses a column once the earlier event has ended', () => {
    const out = layoutTimedEvents([item('a', 540, 600), item('b', 570, 630), item('c', 600, 660)])
    const byId = Object.fromEntries(out.map((p) => [p.item, p]))
    // c starts as a ends, so it takes a's column; the cluster is two wide
    expect(byId.c.column).toBe(0)
    expect(byId.c.columns).toBe(2)
  })

  it('stretches very short events to a clickable minimum', () => {
    const out = layoutTimedEvents([item('a', 540, 542)])
    expect(out[0].endMins - out[0].startMins).toBe(20)
  })
})
