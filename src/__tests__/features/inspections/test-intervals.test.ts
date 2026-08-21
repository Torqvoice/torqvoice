import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INTERVAL_MONTHS,
  TEST_INTERVALS,
  addInterval,
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
})
