import { describe, expect, it } from 'vitest'
import {
  fromZonedWallClock,
  toZonedWallClock,
  zonedDateInput,
  zonedParts,
  zonedTimeInput,
} from '@/lib/timezone'
import { parseWorkshopDateTime } from '@/lib/workshop-datetime'

/**
 * The stand-in a local-time widget is handed.
 *
 * A booking made at half past ten in the workshop has to read half past ten
 * on every screen the workshop looks at, including the pickers that only know
 * how to work in the browser's own clock. These two functions are the whole
 * of that: down into the widget, and back out again unchanged.
 */

/** The harness's own zone, so a round trip is checkable from either side. */
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone

describe('a local stand-in for a workshop wall clock', () => {
  it('reads locally what the instant reads in the workshop', () => {
    const instant = new Date('2026-09-10T22:30:00Z')
    const shown = toZonedWallClock(instant, 'Pacific/Auckland')
    const there = zonedParts(instant, 'Pacific/Auckland')

    expect(shown.getHours()).toBe(there.hour)
    expect(shown.getMinutes()).toBe(there.minute)
    expect(shown.getDate()).toBe(there.day)
    // And it is not the instant itself, unless the two zones happen to agree.
    if (HERE !== 'Pacific/Auckland') expect(shown.getTime()).not.toBe(instant.getTime())
  })

  it('comes back as the instant it stood for', () => {
    for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC', 'Asia/Kolkata']) {
      const instant = new Date('2026-09-10T22:30:00Z')
      const round = fromZonedWallClock(toZonedWallClock(instant, zone), zone)
      expect(round.getTime(), zone).toBe(instant.getTime())
    }
  })

  it('reads a typed time as the workshop typed it', () => {
    // Ten thirty on the widget's face, in a workshop thirteen hours ahead:
    // the instant is the one Auckland calls 10:30, whatever this box thinks.
    const typed = new Date(2026, 8, 11, 10, 30, 0, 0)
    const instant = fromZonedWallClock(typed, 'Pacific/Auckland')
    expect(instant.toISOString()).toBe('2026-09-10T22:30:00.000Z')
  })

  it('survives the hour a workshop skips going into summer time', () => {
    // 02:30 on the last Sunday of March does not exist in Oslo. The picker
    // must still resolve it to a real instant rather than an invalid date.
    const instant = fromZonedWallClock(new Date(2026, 2, 29, 2, 30, 0, 0), 'Europe/Oslo')
    expect(Number.isNaN(instant.getTime())).toBe(false)
    expect(zonedParts(instant, 'Europe/Oslo').day).toBe(29)
  })
})

describe('what a date field and a time field are filled with', () => {
  it("is the workshop's day and clock, not the reader's", () => {
    // 22:30 UTC is the 11th at 10:30 in Auckland and still the 10th at 15:30
    // in Los Angeles. Both readings are of the same reminder.
    const instant = new Date('2026-09-10T22:30:00Z')
    expect(zonedDateInput(instant, 'Pacific/Auckland')).toBe('2026-09-11')
    expect(zonedTimeInput(instant, 'Pacific/Auckland')).toBe('10:30')
    expect(zonedDateInput(instant, 'America/Los_Angeles')).toBe('2026-09-10')
    expect(zonedTimeInput(instant, 'America/Los_Angeles')).toBe('15:30')
  })

  it('pads both, so the strings are what the inputs accept', () => {
    const instant = new Date('2026-01-02T03:04:00Z')
    expect(zonedDateInput(instant, 'UTC')).toBe('2026-01-02')
    expect(zonedTimeInput(instant, 'UTC')).toBe('03:04')
  })

  it('falls back to the browser for a workshop that has never chosen a zone', () => {
    const instant = new Date(2026, 8, 11, 10, 30, 0, 0)
    expect(zonedDateInput(instant, '')).toBe('2026-09-11')
    expect(zonedTimeInput(instant, '')).toBe('10:30')
  })

  it('round trips through the wall clock the server reads back', () => {
    // What the form does: fill the two fields, hand them back as one string,
    // and let the server read that string in the workshop's zone. The
    // instant has to survive it untouched, which is the whole bug.
    const zone = 'Pacific/Auckland'
    const stored = new Date('2026-09-10T22:30:00Z')
    const typed = `${zonedDateInput(stored, zone)}T${zonedTimeInput(stored, zone)}`
    expect(parseWorkshopDateTime(typed, zone).getTime()).toBe(stored.getTime())
  })
})
