/**
 * When a notification before an appointment goes out: counted back in
 * minutes and hours, or on an earlier day at a time of day, on the
 * workshop's own clock.
 */

import { describe, expect, it } from 'vitest'
import { isNotificationDue, notificationFiresAt } from '@/features/calendar/Lib/notificationTiming'

const OSLO = 'Europe/Oslo'
// Monday 16 November 2026, 09:30 in Oslo (UTC+1).
const START = new Date('2026-11-16T08:30:00Z')

describe('when a notification goes out', () => {
  it('counts minutes and hours back from the start', () => {
    expect(
      notificationFiresAt(START, { amount: 1, unit: 'hours', atTime: null }, OSLO).toISOString()
    ).toBe('2026-11-16T07:30:00.000Z')
    expect(
      notificationFiresAt(START, { amount: 15, unit: 'minutes', atTime: null }, OSLO).toISOString()
    ).toBe('2026-11-16T08:15:00.000Z')
  })

  it('goes out on an earlier day at the time of day given, on the workshop clock', () => {
    // 1 day before at 16:00 Oslo: Sunday 15 November, 15:00 UTC.
    expect(
      notificationFiresAt(START, { amount: 1, unit: 'days', atTime: '16:00' }, OSLO).toISOString()
    ).toBe('2026-11-15T15:00:00.000Z')
    // 1 week before at 09:00: Monday 9 November.
    expect(
      notificationFiresAt(START, { amount: 1, unit: 'weeks', atTime: '09:00' }, OSLO).toISOString()
    ).toBe('2026-11-09T08:00:00.000Z')
  })

  it('keeps the time of day across a change of the clocks', () => {
    // Monday 30 March 2026 09:00 Oslo is summer time (UTC+2); the Saturday
    // before is winter time (UTC+1). "2 days before at 18:00" is 18:00 both ways.
    const afterChange = new Date('2026-03-30T07:00:00Z')
    expect(
      notificationFiresAt(
        afterChange,
        { amount: 2, unit: 'days', atTime: '18:00' },
        OSLO
      ).toISOString()
    ).toBe('2026-03-28T17:00:00.000Z')
  })
})

describe('whether it is due', () => {
  const hourBefore = { amount: 1, unit: 'hours', atTime: null }
  const setLongAgo = new Date('2026-11-01T00:00:00Z')

  it('is due from its time until the appointment starts', () => {
    const base = { start: START, timing: hourBefore, sentForStart: null, setAt: setLongAgo }
    expect(isNotificationDue(base, new Date('2026-11-16T07:29:00Z'), OSLO)).toBe(false)
    expect(isNotificationDue(base, new Date('2026-11-16T07:30:00Z'), OSLO)).toBe(true)
    expect(isNotificationDue(base, new Date('2026-11-16T08:30:00Z'), OSLO)).toBe(false)
  })

  it('goes out once for a start, and again when the appointment moves', () => {
    const now = new Date('2026-11-16T07:45:00Z')
    expect(
      isNotificationDue(
        { start: START, timing: hourBefore, sentForStart: START, setAt: setLongAgo },
        now,
        OSLO
      )
    ).toBe(false)
    // Sent for Friday's start, then moved to Monday: due again.
    expect(
      isNotificationDue(
        {
          start: START,
          timing: hourBefore,
          sentForStart: new Date('2026-11-13T08:30:00Z'),
          setAt: setLongAgo,
        },
        now,
        OSLO
      )
    ).toBe(true)
  })

  it('does not fire for a notice whose time had passed when it was set', () => {
    // Booked at 08:00 for 09:30 Oslo with "1 hour before" (07:30 UTC): too late.
    expect(
      isNotificationDue(
        {
          start: START,
          timing: hourBefore,
          sentForStart: null,
          setAt: new Date('2026-11-16T07:40:00Z'),
        },
        new Date('2026-11-16T07:41:00Z'),
        OSLO
      )
    ).toBe(false)
  })
})
