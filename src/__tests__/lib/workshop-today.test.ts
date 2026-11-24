/**
 * "Today" on the workshop's calendar. At 16:00 UTC on 24 November it is
 * already 05:00 on the 25th in Auckland, and at 06:00 UTC on the 25th it is
 * still 22:00 on the 24th in Los Angeles. The UTC day is wrong in both.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDaysToDayKey, dayKeyToLocalDate, workshopTodayKey } from '@/lib/workshop-datetime'

afterEach(() => {
  vi.useRealTimers()
})

describe('workshopTodayKey', () => {
  it('is the next day in Auckland while UTC is still on the 24th', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-24T16:00:00Z'))
    expect(workshopTodayKey('Pacific/Auckland')).toBe('2026-11-25')
  })

  it('is the day before in Los Angeles while UTC is already on the 25th', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T06:00:00Z'))
    expect(workshopTodayKey('America/Los_Angeles')).toBe('2026-11-24')
  })

  it('takes the instant it is given', () => {
    expect(workshopTodayKey('Pacific/Auckland', new Date('2026-11-24T10:59:00Z'))).toBe(
      '2026-11-24'
    )
    expect(workshopTodayKey('Pacific/Auckland', new Date('2026-11-24T11:00:00Z'))).toBe(
      '2026-11-25'
    )
  })

  it('falls back to UTC for a zone the runtime does not know', () => {
    expect(workshopTodayKey('Mars/Olympus_Mons', new Date('2026-11-24T16:00:00Z'))).toBe(
      '2026-11-24'
    )
  })
})

describe('addDaysToDayKey', () => {
  it('counts calendar days across a month end and a DST change', () => {
    expect(addDaysToDayKey('2026-11-25', 14)).toBe('2026-12-09')
    expect(addDaysToDayKey('2026-03-25', 14)).toBe('2026-04-08')
    expect(addDaysToDayKey('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('dayKeyToLocalDate', () => {
  it('reads back as the same day through local getters', () => {
    const d = dayKeyToLocalDate('2026-11-25')
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 25])
  })
})
