import { describe, expect, it } from 'vitest'
import { isoWeekNumber } from '@/features/workboard/Components/WorkBoardToolbar'

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
