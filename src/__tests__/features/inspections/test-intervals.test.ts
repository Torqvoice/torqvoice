import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INTERVAL_MONTHS,
  TEST_INTERVALS,
  addInterval,
  dueDateInstant,
  matchInterval,
  toISODate,
} from '@/features/inspections/Lib/testIntervals'

describe('test intervals', () => {
  it('proposes two years, the Union baseline for cars and light goods vehicles', () => {
    expect(DEFAULT_INTERVAL_MONTHS).toBe(24)
    expect(addInterval(new Date(2026, 7, 15), DEFAULT_INTERVAL_MONTHS)).toBe('2028-08-15')
  })

  it('offers the intervals a member state might apply instead', () => {
    expect(TEST_INTERVALS.map((i) => i.label)).toEqual([
      '6 months',
      '1 year',
      '2 years',
      '3 years',
      '4 years',
    ])
  })

  it('adds part-year intervals by month', () => {
    expect(addInterval(new Date(2026, 7, 15), 6)).toBe('2027-02-15')
  })

  it('keeps a leap-day test from drifting into March', () => {
    // Naive month arithmetic would roll 29 February 2028 to 1 March 2030.
    expect(addInterval(new Date(2028, 1, 29), 24)).toBe('2030-02-28')
  })

  it('does not shift the date across a timezone boundary', () => {
    // toISODate reads local components, so a date built at local midnight
    // survives the round trip rather than slipping to the previous day.
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('recognises which interval a stored date came from', () => {
    const testDate = new Date(2026, 7, 15)
    expect(matchInterval(testDate, '2027-08-15')?.label).toBe('1 year')
    expect(matchInterval(testDate, '2028-08-15')?.label).toBe('2 years')
  })

  it('reports no interval for a date typed by hand', () => {
    expect(matchInterval(new Date(2026, 7, 15), '2027-03-04')).toBeUndefined()
  })

  it('treats a missing date as empty rather than as the epoch', () => {
    expect(toISODate(null)).toBe('')
    expect(toISODate(undefined)).toBe('')
    expect(toISODate('not a date')).toBe('')
  })

  it('reads the day on the workshop calendar, whatever clock the runtime has', () => {
    // 23:30 UTC on 14 August is already 15 August in Oslo. The server renders
    // in UTC and the browser in Oslo; both must land on the same day and the
    // same interval, or the page refuses to hydrate.
    const completed = new Date('2026-08-14T23:30:00Z')
    expect(toISODate(completed, 'Europe/Oslo')).toBe('2026-08-15')
    expect(toISODate(completed, 'UTC')).toBe('2026-08-14')
    expect(addInterval(completed, 24, 'Europe/Oslo')).toBe('2028-08-15')
    expect(matchInterval(completed, '2028-08-15', 'Europe/Oslo')?.label).toBe('2 years')
    expect(matchInterval(completed, '2028-08-14', 'Europe/Oslo')).toBeUndefined()
  })

  it('stores a chosen day as midnight in the workshop, not wherever the browser is', () => {
    expect(dueDateInstant('2028-08-15', 'Europe/Oslo').toISOString()).toBe(
      '2028-08-14T22:00:00.000Z'
    )
    expect(toISODate(dueDateInstant('2028-08-15', 'Europe/Oslo'), 'Europe/Oslo')).toBe('2028-08-15')
  })
})
