/**
 * A job two people are on, as the board and the booking rules see it.
 *
 * The board plans a person's day. So a job with a helper is in two days at
 * once: a card in its technician's lane, and the same job in the helper's.
 * And both of them are busy for it: neither can be offered as free, and the
 * job fills both their days.
 */

import { describe, expect, it } from 'vitest'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import {
  UNLANED,
  groupJobsByLane,
  isHelperLane,
  laneIdsForJob,
} from '@/features/workboard/utils/lanes'
import {
  type Booking,
  findConflicts,
  nextAvailableSlot,
  sharedPeople,
  technicianMinutesInDay,
} from '@/features/workboard/Lib/availability'

function job(id: string, extra: Partial<WorkBoardJob> = {}): WorkBoardJob {
  return {
    id,
    type: 'serviceRecord',
    technicianId: 'andy',
    helperIds: [],
    workBayId: null,
    customerName: null,
    sortOrder: 0,
    title: id,
    status: 'pending',
    startDateTime: '2026-09-01T09:00:00',
    endDateTime: '2026-09-01T12:00:00',
    promisedAt: null,
    vehicle: null,
    ...extra,
  }
}

const ids = (jobs: WorkBoardJob[] | undefined) => (jobs ?? []).map((j) => j.id)

describe('where a shared job is drawn', () => {
  const truck = job('truck', { helperIds: ['sam'] })
  const brakes = job('brakes', { technicianId: 'jo' })

  it('is in its technician’s lane and in the helper’s', () => {
    const lanes = groupJobsByLane([truck, brakes], 'technician')

    expect(ids(lanes.get('andy'))).toEqual(['truck'])
    expect(ids(lanes.get('sam'))).toEqual(['truck'])
    expect(ids(lanes.get('jo'))).toEqual(['brakes'])
  })

  it('knows which of the two lanes it is only helping in', () => {
    expect(isHelperLane(truck, 'sam', 'technician')).toBe(true)
    expect(isHelperLane(truck, 'andy', 'technician')).toBe(false)
    expect(isHelperLane(truck, 'jo', 'technician')).toBe(false)
  })

  it('is drawn once when the board is grouped by bay or not at all', () => {
    const inBay = job('truck', { helperIds: ['sam'], workBayId: 'lift-1' })

    expect(laneIdsForJob(inBay, 'bay')).toEqual(['lift-1'])
    expect(laneIdsForJob(inBay, 'none')).toHaveLength(1)
    expect(isHelperLane(inBay, 'sam', 'bay')).toBe(false)
  })

  it('never lands twice in one lane, mid-drag into the helper’s own', () => {
    // The drag names Sam as the technician before the server has swapped him
    // out of the helpers.
    const midDrag = job('truck', { technicianId: 'sam', helperIds: ['sam'] })

    expect(laneIdsForJob(midDrag, 'technician')).toEqual(['sam'])
  })

  it('leaves out a helper the board is not showing', () => {
    const known = new Set(['andy', 'jo'])

    expect(laneIdsForJob(truck, 'technician', known)).toEqual(['andy'])
  })

  it('still shows in the helper’s lane when its technician is not on the board', () => {
    const known = new Set(['sam'])

    expect(laneIdsForJob(truck, 'technician', known)).toEqual([UNLANED, 'sam'])
  })
})

const at = (hh: number, mm = 0) => new Date(2026, 8, 1, hh, mm, 0, 0)

const booking = (over: Partial<Booking> & { start: Date; end: Date }): Booking => ({
  id: 'b1',
  kind: 'serviceRecord',
  label: 'Truck',
  technicianId: null,
  workBayId: null,
  ...over,
})

describe('whether somebody helping is free', () => {
  const truck = booking({
    id: 'truck',
    start: at(9),
    end: at(12),
    technicianId: 'andy',
    helperIds: ['sam'],
  })

  it('clashes a new job for the helper with the job they are helping on', () => {
    const clashes = findConflicts({ start: at(10), end: at(11), technicianId: 'sam' }, [truck])

    expect(clashes.map((c) => c.id)).toEqual(['truck'])
  })

  it('clashes a job that wants them as a helper with one that has them as its technician', () => {
    const brakes = booking({ id: 'brakes', start: at(10), end: at(11), technicianId: 'sam' })
    const slot = { start: at(9), end: at(12), technicianId: 'andy', helperIds: ['sam'] }

    expect(findConflicts(slot, [brakes]).map((c) => c.id)).toEqual(['brakes'])
    // And it is Sam who is double-booked, not Andy.
    expect(sharedPeople(slot, brakes)).toEqual(['sam'])
  })

  it('leaves somebody who is on neither job free', () => {
    expect(findConflicts({ start: at(10), end: at(11), technicianId: 'jo' }, [truck])).toEqual([])
  })

  it('treats a helper’s time off as a clash for the job', () => {
    const away = booking({
      id: 'absence:1',
      kind: 'absence',
      label: 'holiday',
      start: at(0),
      end: at(23, 59),
      technicianId: 'sam',
    })
    const slot = { start: at(9), end: at(12), technicianId: 'andy', helperIds: ['sam'] }

    expect(findConflicts(slot, [away]).map((c) => c.kind)).toEqual(['absence'])
  })

  it('finds the next slot the whole team is free for, not only the technician', () => {
    // Andy is free all day; Sam is on another job until eleven.
    const brakes = booking({ id: 'brakes', start: at(7), end: at(11), technicianId: 'sam' })

    const alone = nextAvailableSlot({
      from: at(7),
      durationMinutes: 60,
      bookings: [brakes],
      hours: { start: '07:00', end: '15:00' },
      technicianId: 'andy',
    })
    const together = nextAvailableSlot({
      from: at(7),
      durationMinutes: 60,
      bookings: [brakes],
      hours: { start: '07:00', end: '15:00' },
      technicianId: 'andy',
      helperIds: ['sam'],
    })

    expect(alone?.start).toEqual(at(7))
    expect(together?.start).toEqual(at(11))
  })

  it('fills the day of everybody on the job', () => {
    const minutes = technicianMinutesInDay([truck], at(0), new Date(2026, 8, 2))

    expect(minutes).toEqual({ andy: 180, sam: 180 })
  })
})
