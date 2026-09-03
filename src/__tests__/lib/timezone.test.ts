import { describe, expect, it } from 'vitest'
import {
  addZonedDays,
  atZonedTime,
  isZonedWeekend,
  safeTimeZone,
  startOfZonedDay,
  zonedDate,
  zonedDayKey,
  zonedParts,
} from '@/lib/timezone'

/**
 * The server may run in UTC while the workshop is in Oslo. These pin the
 * arithmetic to instants, so they pass whatever TZ the test process has.
 */
describe('timezone helpers', () => {
  it('turns an Oslo wall-clock time into the right instant, summer and winter', () => {
    expect(zonedDate(2026, 9, 14, 10, 30, 'Europe/Oslo').toISOString()).toBe(
      '2026-09-14T08:30:00.000Z'
    )
    expect(zonedDate(2026, 1, 14, 10, 30, 'Europe/Oslo').toISOString()).toBe(
      '2026-01-14T09:30:00.000Z'
    )
    expect(zonedDate(2026, 9, 14, 10, 30, 'UTC').toISOString()).toBe('2026-09-14T10:30:00.000Z')
    expect(zonedDate(2026, 9, 14, 10, 30, 'America/New_York').toISOString()).toBe(
      '2026-09-14T14:30:00.000Z'
    )
  })

  it('reads the wall clock back', () => {
    const p = zonedParts(new Date('2026-09-14T08:30:00Z'), 'Europe/Oslo')
    expect(p).toMatchObject({ year: 2026, month: 9, day: 14, hour: 10, minute: 30, weekday: 1 })
    expect(zonedDayKey(new Date('2026-09-14T22:30:00Z'), 'Europe/Oslo')).toBe('2026-09-15')
    expect(zonedDayKey(new Date('2026-09-14T22:30:00Z'), 'UTC')).toBe('2026-09-14')
  })

  it('finds the start of the day and steps days across a DST change', () => {
    const start = startOfZonedDay(new Date('2026-10-24T20:00:00Z'), 'Europe/Oslo')
    expect(start.toISOString()).toBe('2026-10-23T22:00:00.000Z')
    // Sunday 25 October 2026 is when Oslo leaves summer time.
    const monday = addZonedDays(start, 2, 'Europe/Oslo')
    expect(zonedParts(monday, 'Europe/Oslo')).toMatchObject({ day: 26, hour: 0, minute: 0 })
    expect(atZonedTime(monday, '08:00', 'Europe/Oslo').toISOString()).toBe(
      '2026-10-26T07:00:00.000Z'
    )
  })

  it('knows a weekend by the shop clock, not the server clock', () => {
    // Friday 23:30 in UTC is already Saturday 01:30 in Oslo.
    const late = new Date('2026-09-18T23:30:00Z')
    expect(isZonedWeekend(late, 'UTC')).toBe(false)
    expect(isZonedWeekend(late, 'Europe/Oslo')).toBe(true)
  })

  it('falls back for an empty or invalid zone', () => {
    expect(safeTimeZone('Europe/Oslo')).toBe('Europe/Oslo')
    expect(safeTimeZone('')).toBe('UTC')
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC')
  })
})
