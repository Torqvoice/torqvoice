/**
 * Whether the shop can actually take a job at a given moment.
 *
 * The rule that carries this is what counts as a clash. A technician and a
 * bay are separate resources, set independently on the board, so two jobs at
 * the same hour are only a problem when they want the same person or the same
 * ramp. Getting that wrong in the generous direction double-books a lift; in
 * the strict direction it refuses bookings a shop can genuinely take.
 */

import { describe, expect, it } from 'vitest'
import {
  findConflicts,
  nextAvailableSlot,
  overlaps,
  withinWorkingHours,
  type Booking,
} from '@/features/workboard/Lib/availability'

const at = (day: number, hh: number, mm = 0) => new Date(2026, 8, day, hh, mm, 0, 0)

const HOURS = { start: '07:00', end: '15:00' }

const booking = (over: Partial<Booking> & { start: Date; end: Date }): Booking => ({
  id: 'b1',
  kind: 'serviceRecord',
  label: 'Volvo V60',
  technicianId: null,
  workBayId: null,
  ...over,
})

// 1 Sep 2026 is a Tuesday; the 5th and 6th are the weekend.
describe('overlapping in time', () => {
  it('counts an overlap when each starts before the other ends', () => {
    expect(overlaps(at(1, 9), at(1, 11), at(1, 10), at(1, 12))).toBe(true)
  })

  it('lets one start exactly where the other ends', () => {
    // Back to back is the normal way a bay is used, not a clash.
    expect(overlaps(at(1, 9), at(1, 11), at(1, 11), at(1, 13))).toBe(false)
  })
})

describe('what counts as a clash', () => {
  const existing = [
    booking({
      id: 'job-1',
      start: at(1, 9),
      end: at(1, 11),
      technicianId: 't1',
      workBayId: 'bay1',
    }),
  ]

  it('clashes when the same technician is already busy', () => {
    const c = findConflicts({ start: at(1, 10), end: at(1, 12), technicianId: 't1' }, existing)
    expect(c.map((b) => b.id)).toEqual(['job-1'])
  })

  it('clashes when the same bay is already occupied', () => {
    const c = findConflicts({ start: at(1, 10), end: at(1, 12), workBayId: 'bay1' }, existing)
    expect(c.map((b) => b.id)).toEqual(['job-1'])
  })

  it('allows another person in another bay at the same hour', () => {
    // Two jobs at once is the whole point of having two ramps.
    expect(
      findConflicts(
        { start: at(1, 10), end: at(1, 12), technicianId: 't2', workBayId: 'bay2' },
        existing
      )
    ).toEqual([])
  })

  it('ignores a job that holds neither a person nor a bay', () => {
    // Unassigned work is on the list, not in the shop, so nothing collides.
    const loose = [booking({ id: 'job-2', start: at(1, 9), end: at(1, 11) })]
    expect(
      findConflicts(
        { start: at(1, 10), end: at(1, 12), technicianId: 't1', workBayId: 'bay1' },
        loose
      )
    ).toEqual([])
  })

  it('never reports the job being edited against itself', () => {
    // Reopening a booking and pressing save must not clash with itself.
    const c = findConflicts(
      { start: at(1, 9), end: at(1, 11), technicianId: 't1' },
      existing,
      'job-1'
    )
    expect(c).toEqual([])
  })

  it('catches an inspection holding the bay, not only a job', () => {
    const inspections = [
      booking({
        id: 'insp-1',
        kind: 'inspection',
        start: at(1, 9),
        end: at(1, 10),
        workBayId: 'bay1',
      }),
    ]
    const c = findConflicts({ start: at(1, 9, 30), end: at(1, 11), workBayId: 'bay1' }, inspections)
    expect(c.map((b) => b.kind)).toEqual(['inspection'])
  })
})

describe('staying inside the working day', () => {
  it('accepts a slot within opening hours', () => {
    expect(withinWorkingHours({ start: at(1, 9), end: at(1, 11) }, HOURS)).toBe(true)
  })

  it('rejects a slot running past closing time', () => {
    expect(withinWorkingHours({ start: at(1, 14), end: at(1, 16) }, HOURS)).toBe(false)
  })

  it('rejects a weekend unless the shop works them', () => {
    expect(withinWorkingHours({ start: at(5, 9), end: at(5, 11) }, HOURS)).toBe(false)
    expect(
      withinWorkingHours({ start: at(5, 9), end: at(5, 11) }, { ...HOURS, includeWeekends: true })
    ).toBe(true)
  })
})

describe('finding the next free slot', () => {
  it('offers the opening time when nothing is booked', () => {
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 60,
      bookings: [],
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(1, 7))
    expect(slot?.end).toEqual(at(1, 8))
  })

  it('starts from now rather than this morning', () => {
    // Searching at half past two must not offer nine o'clock.
    const slot = nextAvailableSlot({
      from: at(1, 9, 30),
      durationMinutes: 60,
      bookings: [],
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(1, 9, 30))
  })

  it('lands on the moment the bay frees up', () => {
    const bookings = [booking({ start: at(1, 7), end: at(1, 9, 30), workBayId: 'bay1' })]
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 60,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(1, 9, 30))
  })

  it('steps over a run of back-to-back bookings in one go', () => {
    const bookings = [
      booking({ id: 'a', start: at(1, 7), end: at(1, 9), workBayId: 'bay1' }),
      booking({ id: 'b', start: at(1, 9), end: at(1, 11), workBayId: 'bay1' }),
      booking({ id: 'c', start: at(1, 11), end: at(1, 12), workBayId: 'bay1' }),
    ]
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 60,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(1, 12))
  })

  it('rolls to the next day when today cannot fit the job', () => {
    const bookings = [booking({ start: at(1, 7), end: at(1, 15), workBayId: 'bay1' })]
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 120,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(2, 7))
  })

  it('never offers a slot that would run past closing time', () => {
    const bookings = [booking({ start: at(1, 7), end: at(1, 14), workBayId: 'bay1' })]
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 120,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    // 14:00 leaves only an hour, so the two-hour job goes to the next morning.
    expect(slot?.start).toEqual(at(2, 7))
  })

  it('skips the weekend for a shop that does not work it', () => {
    // The 4th is a Friday, fully booked; the next working day is Monday the 7th.
    const bookings = [booking({ start: at(4, 7), end: at(4, 15), workBayId: 'bay1' })]
    const slot = nextAvailableSlot({
      from: at(4, 6),
      durationMinutes: 60,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(7, 7))
  })

  it('uses the weekend when the shop works it', () => {
    const bookings = [booking({ start: at(4, 7), end: at(4, 15), workBayId: 'bay1' })]
    const slot = nextAvailableSlot({
      from: at(4, 6),
      durationMinutes: 60,
      bookings,
      hours: { ...HOURS, includeWeekends: true },
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(5, 7))
  })

  it('ignores work that holds a different resource', () => {
    const bookings = [booking({ start: at(1, 7), end: at(1, 12), workBayId: 'bay2' })]
    const slot = nextAvailableSlot({
      from: at(1, 6),
      durationMinutes: 60,
      bookings,
      hours: HOURS,
      workBayId: 'bay1',
    })
    expect(slot?.start).toEqual(at(1, 7))
  })

  it('gives up rather than offering a slot months away', () => {
    // A fortnight of solid booking should say "nothing free", not hand back
    // a date nobody would accept.
    const bookings = Array.from({ length: 40 }, (_, i) =>
      booking({ id: `b${i}`, start: at(1 + i, 7), end: at(1 + i, 15), workBayId: 'bay1' })
    )
    expect(
      nextAvailableSlot({
        from: at(1, 6),
        durationMinutes: 60,
        bookings,
        hours: HOURS,
        workBayId: 'bay1',
        searchDays: 3,
      })
    ).toBeNull()
  })
})
