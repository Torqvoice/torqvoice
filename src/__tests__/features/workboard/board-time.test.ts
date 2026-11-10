/**
 * The work board runs on the workshop's clock, whatever zone the browser is in.
 *
 * Jobs are drawn as the workshop's wall clock and every time the board builds
 * from a drag or a drop is turned back into a real instant before it is
 * saved. These tests move the test process between zones, because the bug
 * only shows when the viewer and the workshop disagree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import {
  boardNow,
  fromBoardDate,
  fromBoardSpan,
  toBoardDate,
  toBoardJob,
} from '@/features/workboard/utils/board-time'
import { zonedParts } from '@/lib/timezone'

const originalTz = process.env.TZ

function viewerIn(zone: string) {
  process.env.TZ = zone
}

beforeEach(() => viewerIn('Europe/Oslo'))
afterEach(() => {
  process.env.TZ = originalTz
})

function job(start: string | null, end: string | null): WorkBoardJob {
  return {
    id: 'j1',
    type: 'serviceRecord',
    technicianId: 't1',
    helperIds: [],
    workBayId: null,
    customerName: null,
    sortOrder: 0,
    title: 'Brake job',
    status: 'pending',
    startDateTime: start,
    endDateTime: end,
    promisedAt: '2026-11-10T15:00:00.000Z',
    vehicle: null,
  }
}

const WORKSHOPS = ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']
const VIEWERS = ['Europe/Oslo', 'America/Los_Angeles', 'Pacific/Auckland']
const INSTANTS = [
  '2026-11-10T11:48:00.000Z',
  // The next day in Auckland, still the same day in UTC.
  '2026-11-10T23:30:00.000Z',
  // The day before in Los Angeles.
  '2026-11-10T03:15:00.000Z',
]

describe('toBoardJob and fromBoardDate', () => {
  for (const workshop of WORKSHOPS) {
    for (const viewer of VIEWERS) {
      it(`round-trips every instant for a ${workshop} workshop seen from ${viewer}`, () => {
        viewerIn(viewer)
        for (const instant of INSTANTS) {
          const board = toBoardJob(job(instant, instant), workshop)
          const drawn = new Date(board.startDateTime as string)

          // The local fields the layout reads are the workshop's wall clock.
          const wall = zonedParts(new Date(instant), workshop)
          expect([drawn.getFullYear(), drawn.getMonth() + 1, drawn.getDate()]).toEqual([
            wall.year,
            wall.month,
            wall.day,
          ])
          expect(drawn.getHours() * 60 + drawn.getMinutes()).toBe(wall.hour * 60 + wall.minute)

          // And a time read off the board saves as the instant it came from.
          expect(fromBoardDate(drawn, workshop).toISOString()).toBe(instant)
        }
      })
    }
  }

  it('leaves the promise a real instant, because the overdue check compares it with now', () => {
    const board = toBoardJob(job('2026-11-10T11:48:00.000Z', null), 'Pacific/Auckland')
    expect(board.promisedAt).toBe('2026-11-10T15:00:00.000Z')
    expect(board.endDateTime).toBeNull()
  })

  it('changes nothing when the workshop has no zone', () => {
    const original = job('2026-11-10T11:48:00.000Z', '2026-11-10T12:48:00.000Z')
    expect(toBoardJob(original, '')).toBe(original)

    const local = new Date('2026-11-10T10:00:00')
    expect(fromBoardDate(local, '')).toBe(local)
    expect(toBoardDate(local, '')).toBe(local)
    expect(boardNow('', local)).toEqual({ dayKey: '2026-11-10', minutes: 600 })
  })
})

describe('what a drag saves', () => {
  it('is 10:00 Auckland time when the block is dropped at 10:00, seen from Oslo', () => {
    viewerIn('Europe/Oslo')
    const droppedAt = new Date('2026-11-10T10:00:00')

    // Auckland is on daylight time (UTC+13) in November.
    expect(fromBoardDate(droppedAt, 'Pacific/Auckland').toISOString()).toBe(
      '2026-11-09T21:00:00.000Z'
    )
  })

  it('is 10:00 UTC for a UTC workshop, not 10:00 in the browser', () => {
    viewerIn('Europe/Oslo')
    expect(fromBoardDate(new Date('2026-11-10T10:00:00'), 'UTC').toISOString()).toBe(
      '2026-11-10T10:00:00.000Z'
    )
  })
})

describe('boardNow', () => {
  it('is today and the time of day on the workshop clock', () => {
    const at = new Date('2026-11-10T23:30:00.000Z')
    expect(boardNow('UTC', at)).toEqual({ dayKey: '2026-11-10', minutes: 23 * 60 + 30 })
    expect(boardNow('Pacific/Auckland', at)).toEqual({
      dayKey: '2026-11-11',
      minutes: 12 * 60 + 30,
    })
    expect(boardNow('America/Los_Angeles', at)).toEqual({
      dayKey: '2026-11-10',
      minutes: 15 * 60 + 30,
    })
  })
})

/**
 * A job dragged across the night the viewer's clocks change. The workshop is
 * on UTC, which never changes; the screen is in Oslo, which leaves summer
 * time early on 25 October 2026. A two day job over that night is 49 hours
 * apart on the Oslo screen, and still 48 hours long.
 */
describe('a job moved across the viewer’s clock change', () => {
  const stored = job('2026-10-24T08:00:00.000Z', '2026-10-26T08:00:00.000Z')
  const HOUR = 60 * 60 * 1000

  it('keeps its real length when it is moved to another week', () => {
    viewerIn('Europe/Oslo')
    const drawn = toBoardJob(stored, 'UTC')
    const drawnStart = new Date(drawn.startDateTime as string)
    const drawnEnd = new Date(drawn.endDateTime as string)
    // The premise: on the Oslo screen the two ends are 49 hours apart.
    expect(drawnEnd.getTime() - drawnStart.getTime()).toBe(49 * HOUR)
    // Moved on the board as the drag does it: the drawn length, from the new start.
    const boardStart = new Date('2026-10-20T08:00:00')
    const boardEnd = new Date(boardStart.getTime() + (drawnEnd.getTime() - drawnStart.getTime()))

    const saved = fromBoardSpan({ stored, drawn, boardStart, boardEnd, timeZone: 'UTC' })

    expect(saved.start.toISOString()).toBe('2026-10-20T08:00:00.000Z')
    expect(saved.end.toISOString()).toBe('2026-10-22T08:00:00.000Z')
    expect(saved.end.getTime() - saved.start.getTime()).toBe(48 * HOUR)
  })

  it('saves a stretched edge at the time it was dragged to on the workshop clock', () => {
    viewerIn('Europe/Oslo')
    const drawn = toBoardJob(stored, 'UTC')
    // The end pulled from 08:00 to 10:00 on the 26th; the start stays put.
    const boardStart = new Date(drawn.startDateTime as string)
    const boardEnd = new Date('2026-10-26T10:00:00')

    const saved = fromBoardSpan({ stored, drawn, boardStart, boardEnd, timeZone: 'UTC' })

    expect(saved.start.toISOString()).toBe('2026-10-24T08:00:00.000Z')
    expect(saved.end.toISOString()).toBe('2026-10-26T10:00:00.000Z')
  })

  it('saves both ends where they were dropped for a job that had no times yet', () => {
    viewerIn('Europe/Oslo')
    const unscheduled = job(null, null)
    // Dropped as a block running over the night the clocks change.
    const boardStart = new Date('2026-10-24T08:00:00')
    const boardEnd = new Date('2026-10-26T08:00:00')

    const saved = fromBoardSpan({
      stored: unscheduled,
      drawn: toBoardJob(unscheduled, 'UTC'),
      boardStart,
      boardEnd,
      timeZone: 'UTC',
    })

    expect(saved.start.toISOString()).toBe('2026-10-24T08:00:00.000Z')
    expect(saved.end.toISOString()).toBe('2026-10-26T08:00:00.000Z')
  })
})
