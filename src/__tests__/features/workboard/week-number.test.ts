import { describe, expect, it } from 'vitest'
import { isoWeekNumber } from '@/features/workboard/Components/WorkBoardToolbar'
import { formatClock } from '@/features/workboard/utils/clock'

/**
 * The workshop that asked for this view schedules by ISO week number, and the
 * planner it uses shows "KW 35" for the week of Monday 24 August 2026. An
 * off-by-one here would be wrong in the one place the number is read aloud.
 */
describe('isoWeekNumber', () => {
  it('matches the reference planner', () => {
    expect(isoWeekNumber('2026-08-24')).toBe(35)
  })

  it('gives the same number whichever weekday the shop starts on', () => {
    expect(isoWeekNumber('2026-08-23')).toBe(35)
  })

  it('counts the week that straddles New Year as week one', () => {
    expect(isoWeekNumber('2025-12-29')).toBe(1)
    expect(isoWeekNumber('2026-01-01')).toBe(1)
  })

  it('knows a 53-week year', () => {
    expect(isoWeekNumber('2026-12-28')).toBe(53)
    expect(isoWeekNumber('2027-01-04')).toBe(1)
  })
})

describe('formatClock', () => {
  it('pads a 24-hour clock', () => {
    expect(formatClock(7 * 60, '24h')).toBe('07:00')
    expect(formatClock(13 * 60 + 5, '24h')).toBe('13:05')
  })

  it('drops the minutes on the hour in 12-hour time, where the gutter is tight', () => {
    expect(formatClock(7 * 60, '12h')).toBe('7 AM')
    expect(formatClock(13 * 60, '12h')).toBe('1 PM')
  })

  it('keeps them off the hour', () => {
    expect(formatClock(13 * 60 + 30, '12h')).toBe('1:30 PM')
  })

  it('calls the ends of the day midnight and noon', () => {
    expect(formatClock(0, '12h')).toBe('12 AM')
    expect(formatClock(12 * 60, '12h')).toBe('12 PM')
    expect(formatClock(1440, '12h')).toBe('12 AM')
  })
})
