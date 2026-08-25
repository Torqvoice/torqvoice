import { describe, expect, it } from 'vitest'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import {
  bookedMinutesOnDay,
  computeTimeWindow,
  hourMarks,
  isUnscheduled,
  layoutLaneDay,
  resolveJobOnDay,
  snapToStep,
} from '@/features/workboard/utils/layout'
import {
  ALL_LANE,
  UNLANED,
  buildLanes,
  groupJobsByLane,
  isLaneGrouping,
  laneAssignment,
  laneIdForJob,
} from '@/features/workboard/utils/lanes'

/**
 * Times are written without a zone so they parse as local, the same way the
 * board reads them from the API. A test that pinned them to UTC would pass or
 * fail depending on where it ran.
 */
function job(
  id: string,
  start: string | null,
  end: string | null,
  extra: Partial<WorkBoardJob> = {}
): WorkBoardJob {
  return {
    id,
    type: 'serviceRecord',
    technicianId: 't1',
    workBayId: null,
    sortOrder: 0,
    title: id,
    status: 'pending',
    startDateTime: start,
    endDateTime: end,
    vehicle: null,
    ...extra,
  }
}

const DAY = '2026-08-25'
const NEXT_DAY = '2026-08-26'
const WINDOW = { startMins: 8 * 60, endMins: 18 * 60 }

describe('resolveJobOnDay', () => {
  it('places a job at its own hours', () => {
    const result = resolveJobOnDay(job('a', `${DAY}T09:00:00`, `${DAY}T10:30:00`), DAY, WINDOW)
    expect(result).toMatchObject({
      startMins: 540,
      endMins: 630,
      continuesBefore: false,
      continuesAfter: false,
    })
  })

  it('ignores a job with no times', () => {
    expect(resolveJobOnDay(job('a', null, null), DAY, WINDOW)).toBeNull()
  })

  it('ignores a job on another day', () => {
    const other = job('a', `${NEXT_DAY}T09:00:00`, `${NEXT_DAY}T10:00:00`)
    expect(resolveJobOnDay(other, DAY, WINDOW)).toBeNull()
  })

  it('marks the first day of a job that runs into the next', () => {
    const long = job('a', `${DAY}T16:00:00`, `${NEXT_DAY}T09:00:00`)
    expect(resolveJobOnDay(long, DAY, WINDOW)).toMatchObject({
      startMins: 960,
      endMins: WINDOW.endMins,
      continuesBefore: false,
      continuesAfter: true,
    })
  })

  it('marks the second day of the same job', () => {
    const long = job('a', `${DAY}T16:00:00`, `${NEXT_DAY}T09:00:00`)
    expect(resolveJobOnDay(long, NEXT_DAY, WINDOW)).toMatchObject({
      startMins: WINDOW.startMins,
      endMins: 540,
      continuesBefore: true,
      continuesAfter: false,
    })
  })

  it('clamps a job that starts before the visible hours', () => {
    const early = job('a', `${DAY}T06:00:00`, `${DAY}T09:00:00`)
    expect(resolveJobOnDay(early, DAY, WINDOW)).toMatchObject({
      startMins: WINDOW.startMins,
      endMins: 540,
      continuesBefore: true,
    })
  })

  it('drops a job that falls entirely outside the visible hours', () => {
    const night = job('a', `${DAY}T04:00:00`, `${DAY}T05:00:00`)
    expect(resolveJobOnDay(night, DAY, WINDOW)).toBeNull()
  })

  it('does not carry a job that ends exactly at midnight into the next day', () => {
    const untilMidnight = job('a', `${DAY}T22:00:00`, `${NEXT_DAY}T00:00:00`)
    expect(resolveJobOnDay(untilMidnight, NEXT_DAY, { startMins: 0, endMins: 1440 })).toBeNull()
  })
})

describe('layoutLaneDay', () => {
  it('gives a lone job the full width', () => {
    const laid = layoutLaneDay([job('a', `${DAY}T09:00:00`, `${DAY}T10:00:00`)], DAY, WINDOW)
    expect(laid).toHaveLength(1)
    expect(laid[0]).toMatchObject({ column: 0, columns: 1 })
  })

  it('keeps consecutive jobs full width', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T10:00:00`),
        job('b', `${DAY}T10:00:00`, `${DAY}T11:00:00`),
      ],
      DAY,
      WINDOW
    )
    expect(laid.map((item) => item.columns)).toEqual([1, 1])
    expect(laid.map((item) => item.column)).toEqual([0, 0])
  })

  it('splits two overlapping jobs side by side', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T11:00:00`),
        job('b', `${DAY}T10:00:00`, `${DAY}T12:00:00`),
      ],
      DAY,
      WINDOW
    )
    expect(laid.map((item) => item.columns)).toEqual([2, 2])
    expect(laid.map((item) => item.column)).toEqual([0, 1])
  })

  it('widens the whole cluster when three jobs overlap', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T12:00:00`),
        job('b', `${DAY}T09:30:00`, `${DAY}T11:00:00`),
        job('c', `${DAY}T10:00:00`, `${DAY}T10:30:00`),
      ],
      DAY,
      WINDOW
    )
    expect(laid.map((item) => item.columns)).toEqual([3, 3, 3])
    expect(new Set(laid.map((item) => item.column)).size).toBe(3)
  })

  it('starts a fresh cluster once the lane is clear again', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T11:00:00`),
        job('b', `${DAY}T10:00:00`, `${DAY}T12:00:00`),
        job('c', `${DAY}T13:00:00`, `${DAY}T14:00:00`),
      ],
      DAY,
      WINDOW
    )
    expect(laid.map((item) => item.columns)).toEqual([2, 2, 1])
  })

  it('reuses a freed column inside a cluster instead of narrowing everything', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T10:00:00`),
        job('b', `${DAY}T09:00:00`, `${DAY}T11:00:00`),
        job('c', `${DAY}T10:30:00`, `${DAY}T12:00:00`),
      ],
      DAY,
      WINDOW
    )
    // Only two jobs ever run at once, so the cluster stays two columns wide
    // and c takes the column a has finished with.
    const columnById = Object.fromEntries(laid.map((item) => [item.job.id, item.column]))
    expect(laid.map((item) => item.columns)).toEqual([2, 2, 2])
    expect(columnById).toEqual({ a: 1, b: 0, c: 1 })
  })

  it('leaves out jobs that belong to another day', () => {
    const laid = layoutLaneDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T10:00:00`),
        job('b', `${NEXT_DAY}T09:00:00`, `${NEXT_DAY}T10:00:00`),
      ],
      DAY,
      WINDOW
    )
    expect(laid.map((item) => item.job.id)).toEqual(['a'])
  })
})

describe('computeTimeWindow', () => {
  const days = [DAY, NEXT_DAY]

  it('falls back to the configured work day', () => {
    expect(computeTimeWindow([], days, 420, 900)).toEqual({ startMins: 420, endMins: 900 })
  })

  it('stretches to show a job that runs late', () => {
    const late = job('a', `${DAY}T14:00:00`, `${DAY}T18:30:00`)
    expect(computeTimeWindow([late], days, 420, 900)).toEqual({ startMins: 420, endMins: 1140 })
  })

  it('stretches to show a job that starts early', () => {
    const early = job('a', `${DAY}T05:30:00`, `${DAY}T08:00:00`)
    expect(computeTimeWindow([early], days, 420, 900)).toEqual({ startMins: 300, endMins: 900 })
  })

  it('does not flatten the week for a job that spans several days', () => {
    const long = job('a', `${DAY}T13:00:00`, `${NEXT_DAY}T14:00:00`)
    expect(computeTimeWindow([long], days, 420, 900)).toEqual({ startMins: 420, endMins: 900 })
  })

  it('opens the axis for the tail of a job carried in from before the week', () => {
    const carried = job('a', '2026-08-24T20:00:00', `${DAY}T06:30:00`)
    expect(computeTimeWindow([carried], days, 420, 900)).toMatchObject({ startMins: 360 })
  })

  it('ignores jobs that never touch the shown days', () => {
    const elsewhere = job('a', '2026-09-10T05:00:00', '2026-09-10T06:00:00')
    expect(computeTimeWindow([elsewhere], days, 420, 900)).toEqual({
      startMins: 420,
      endMins: 900,
    })
  })
})

describe('bookedMinutesOnDay', () => {
  it('adds up the jobs on a day', () => {
    const total = bookedMinutesOnDay(
      [
        job('a', `${DAY}T09:00:00`, `${DAY}T10:30:00`),
        job('b', `${DAY}T13:00:00`, `${DAY}T14:00:00`),
      ],
      DAY
    )
    expect(total).toBe(150)
  })

  it('counts only the part of a multi-day job that falls on the day', () => {
    const total = bookedMinutesOnDay([job('a', `${DAY}T22:00:00`, `${NEXT_DAY}T02:00:00`)], DAY)
    expect(total).toBe(120)
  })

  it('counts work booked outside the visible hours', () => {
    const total = bookedMinutesOnDay([job('a', `${DAY}T19:00:00`, `${DAY}T21:00:00`)], DAY)
    expect(total).toBe(120)
  })

  it('ignores jobs with no times', () => {
    expect(bookedMinutesOnDay([job('a', null, null)], DAY)).toBe(0)
  })
})

describe('hourMarks', () => {
  it('includes both ends of the window', () => {
    expect(hourMarks({ startMins: 480, endMins: 660 })).toEqual([480, 540, 600, 660])
  })

  it('skips a partial hour before the window opens', () => {
    expect(hourMarks({ startMins: 510, endMins: 660 })).toEqual([540, 600, 660])
  })
})

describe('snapToStep', () => {
  it('snaps to the nearest step', () => {
    expect(snapToStep(547, 15, WINDOW)).toBe(540)
    expect(snapToStep(553, 15, WINDOW)).toBe(555)
  })

  it('keeps the result inside the window', () => {
    expect(snapToStep(60, 15, WINDOW)).toBe(WINDOW.startMins)
    expect(snapToStep(2000, 15, WINDOW)).toBe(WINDOW.endMins)
  })
})

describe('isUnscheduled', () => {
  it('is true when either end is missing', () => {
    expect(isUnscheduled(job('a', null, null))).toBe(true)
    expect(isUnscheduled(job('a', `${DAY}T09:00:00`, null))).toBe(true)
    expect(isUnscheduled(job('a', `${DAY}T09:00:00`, `${DAY}T10:00:00`))).toBe(false)
  })
})

describe('lanes', () => {
  const technicians = [
    {
      id: 't1',
      name: 'Ada',
      color: '#111111',
      isActive: true,
      sortOrder: 0,
      dailyCapacity: 480,
      userId: null,
      organizationId: 'org',
    },
  ]
  const bays = [
    {
      id: 'b1',
      name: 'Lift 1',
      color: '#222222',
      isActive: true,
      sortOrder: 0,
      dailyCapacity: 600,
      organizationId: 'org',
    },
  ]
  const labels = { unlaned: 'None', all: 'All work' }

  it('reads the lane a job belongs to for each grouping', () => {
    const withBay = job('a', null, null, { workBayId: 'b1' })
    expect(laneIdForJob(withBay, 'technician')).toBe('t1')
    expect(laneIdForJob(withBay, 'bay')).toBe('b1')
    expect(laneIdForJob(withBay, 'none')).toBe(ALL_LANE)
  })

  it('puts a job with no value for the grouping in the catch-all lane', () => {
    expect(laneIdForJob(job('a', null, null), 'bay')).toBe(UNLANED)
  })

  it('hides the catch-all lane when every job has a value', () => {
    const jobs = [job('a', null, null, { workBayId: 'b1' })]
    const lanes = buildLanes({ grouping: 'bay', technicians, workBays: bays, jobs, labels })
    expect(lanes.map((lane) => lane.id)).toEqual(['b1'])
  })

  it('shows the catch-all lane when something would otherwise vanish', () => {
    const jobs = [job('a', null, null)]
    const lanes = buildLanes({ grouping: 'bay', technicians, workBays: bays, jobs, labels })
    expect(lanes.map((lane) => lane.id)).toEqual(['b1', UNLANED])
    expect(lanes[1].isPlaceholder).toBe(true)
  })

  it('sums capacity into the single lane when nothing is grouped', () => {
    const lanes = buildLanes({
      grouping: 'none',
      technicians,
      workBays: bays,
      jobs: [],
      labels,
    })
    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toMatchObject({ id: ALL_LANE, dailyCapacity: 480 })
  })

  it('writes the field the grouping owns, and nothing else', () => {
    expect(laneAssignment('t2', 'technician')).toEqual({ technicianId: 't2' })
    expect(laneAssignment('b2', 'bay')).toEqual({ workBayId: 'b2' })
    expect(laneAssignment(UNLANED, 'bay')).toEqual({ workBayId: null })
    expect(laneAssignment(ALL_LANE, 'none')).toEqual({})
  })

  it('buckets jobs by lane', () => {
    const jobs = [
      job('a', null, null, { workBayId: 'b1' }),
      job('b', null, null, { workBayId: 'b1' }),
      job('c', null, null),
    ]
    const grouped = groupJobsByLane(jobs, 'bay')
    expect(grouped.get('b1')?.map((item) => item.id)).toEqual(['a', 'b'])
    expect(grouped.get(UNLANED)?.map((item) => item.id)).toEqual(['c'])
  })

  it('validates a grouping coming in from the URL', () => {
    expect(isLaneGrouping('bay')).toBe(true)
    expect(isLaneGrouping('bays')).toBe(false)
    expect(isLaneGrouping(null)).toBe(false)
  })
})

describe('lanes that are no longer on the board', () => {
  const bays = [
    {
      id: 'b1',
      name: 'Lift 1',
      color: '#222222',
      isActive: true,
      sortOrder: 0,
      dailyCapacity: 600,
      organizationId: 'org',
    },
  ]

  it('folds work pointing at an unknown lane into the catch-all', () => {
    const orphan = job('a', null, null, { workBayId: 'deleted-bay' })
    expect(laneIdForJob(orphan, 'bay')).toBe('deleted-bay')
    expect(laneIdForJob(orphan, 'bay', new Set(['b1']))).toBe(UNLANED)
  })

  it('shows the catch-all lane for it, so the job stays visible', () => {
    const jobs = [job('a', null, null, { workBayId: 'deleted-bay' })]
    const lanes = buildLanes({
      grouping: 'bay',
      technicians: [],
      workBays: bays,
      jobs,
      labels: { unlaned: 'None', all: 'All work' },
    })
    expect(lanes.map((lane) => lane.id)).toEqual(['b1', UNLANED])

    const grouped = groupJobsByLane(jobs, 'bay', new Set(['b1']))
    expect(grouped.get(UNLANED)?.map((item) => item.id)).toEqual(['a'])
  })
})
