import { describe, expect, it } from 'vitest'
import { fromZonedWallClock, toZonedWallClock, zonedParts } from '@/lib/timezone'

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
