/**
 * The hours under a technician's day, as a planner reads them.
 *
 * A wall screen showed "1117h / 8h" on a Monday: a restoration booked across
 * seven weeks was counted whole on every day it touched. The figure is how
 * much of that one day the work takes, so a job that runs for weeks takes a
 * working day of it and no more, and the card grid and the timeline say the
 * same number for the same day.
 *
 * Every case runs in two zones far from UTC and on opposite sides of it: the
 * board reads its days with a `Date`'s local getters.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import { WeekCardGrid } from '@/features/workboard/Components/WeekCardGrid'
import { WeekTimeline } from '@/features/workboard/Components/WeekTimeline'
import {
  type AwayByLaneDay,
  type ClosedByDay,
  awayKey,
} from '@/features/workboard/hooks/useBoardCalendar'
import { buildLanes, groupJobsByLane } from '@/features/workboard/utils/lanes'
import type { Technician } from '@/features/workboard/store/workboardStore'
import { awayDay, closedDay } from '@/features/workshop-calendar/Lib/boardDays'
import { type WorkshopCalendar, defaultWeek } from '@/features/workshop-calendar/Lib/calendar'

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: '',
    weekStartDay: 1,
  }),
}))

// Monday to Wednesday of one week.
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'

const technician = (id: string, name: string, sortOrder: number): Technician => ({
  id,
  name,
  color: '#3b82f6',
  isActive: true,
  sortOrder,
  dailyCapacity: 480,
  userId: null,
  organizationId: 'org-a',
})

const technicians = [technician('ada', 'Ada', 0), technician('sam', 'Sam', 1)]

/** Times without a zone, as the board draws them: the workshop's wall clock. */
function job(id: string, title: string, start: string, end: string, helperIds: string[] = []) {
  return {
    id,
    type: 'serviceRecord',
    technicianId: 'ada',
    helperIds,
    workBayId: null,
    customerName: null,
    sortOrder: 0,
    title,
    status: 'in-progress',
    startDateTime: start,
    endDateTime: end,
    promisedAt: null,
    vehicle: null,
  } satisfies WorkBoardJob
}

/** Seven weeks in the shop, like the Dauphine on the wall screen. */
const restoration = job(
  'restoration',
  'Dauphine restoration',
  '2026-10-19T08:00:00',
  '2026-12-04T17:00:00'
)
const engineRebuild = job('engine', 'Engine rebuild', '2026-11-02T08:00:00', '2026-11-20T16:00:00')
const respray = job('respray', 'Respray', '2026-11-05T09:00:00', '2026-11-13T15:00:00')

/** Open 08:00 to 16:00 on weekdays: an eight hour day, the same as Ada's capacity. */
function calendar(extra: Partial<WorkshopCalendar> = {}): WorkshopCalendar {
  return {
    timeZone: 'UTC',
    week: defaultWeek('08:00', '16:00'),
    closures: [],
    absences: [],
    ...extra,
  }
}

function boardCalendar(cal: WorkshopCalendar, days: string[]) {
  const closedByDay: ClosedByDay = {}
  const awayByLaneDay: AwayByLaneDay = {}
  for (const day of days) {
    closedByDay[day] = { ...closedDay(cal, day), label: null }
    for (const tech of technicians) {
      const away = awayDay(cal, tech.id, day)
      if (away)
        awayByLaneDay[awayKey(tech.id, day)] = {
          spans: away.spans,
          allDay: away.allDay,
          label: 'Holiday',
        }
    }
  }
  return { closedByDay, awayByLaneDay }
}

function lanesFor(jobs: WorkBoardJob[]) {
  return buildLanes({
    grouping: 'technician',
    technicians,
    workBays: [],
    jobs,
    labels: { unlaned: 'No technician', all: 'Everyone' },
  })
}

function renderCards(jobs: WorkBoardJob[], days: string[], cal: WorkshopCalendar | null) {
  const board = cal ? boardCalendar(cal, days) : {}
  render(
    <TooltipProvider>
      <DndContext>
        <WeekCardGrid
          days={days}
          lanes={lanesFor(jobs)}
          jobsByLane={groupJobsByLane(jobs, 'technician')}
          todayStr={MON}
          timeFormat="24h"
          onOpenJob={vi.fn()}
          {...board}
        />
      </DndContext>
    </TooltipProvider>
  )
}

/** The timeline's figure for Ada's day is in the hover on her lane header. */
async function timelineBooked(jobs: WorkBoardJob[], day: string, cal: WorkshopCalendar | null) {
  cleanup()
  const board = cal ? boardCalendar(cal, [day]) : {}
  render(
    <TooltipProvider>
      <DndContext>
        <WeekTimeline
          days={[day]}
          lanes={lanesFor(jobs)}
          jobs={jobs}
          grouping="technician"
          zoom={1}
          snapMinutes={15}
          workDayStart="08:00"
          workDayEnd="16:00"
          onOpenJob={vi.fn()}
          onSchedule={vi.fn()}
          onLaneClick={vi.fn()}
          {...board}
        />
      </DndContext>
    </TooltipProvider>
  )
  fireEvent.focus(screen.getByRole('button', { name: /^Ada/ }))
  const tip = await screen.findByRole('tooltip')
  return tip.textContent?.match(/Booked(.+?)(Capacity|Jobs)/)?.[1] ?? null
}

/** The figures under the days, in the order the grid draws them. */
function figures() {
  return screen.queryAllByText(/ \/ 8h$/).map((el) => el.textContent)
}

// The timeline measures itself; jsdom has nothing to measure with.
const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)

const originalTz = process.env.TZ

describe.each(['Pacific/Auckland', 'America/Los_Angeles'])('booked hours on a day (%s)', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('counts a job that runs for weeks as one working day on each day', () => {
    renderCards([restoration], [MON, TUE, WED], calendar())

    expect(figures()).toEqual(['8h / 8h', '8h / 8h', '8h / 8h'])
  })

  it('says the same figure in the timeline', async () => {
    expect(await timelineBooked([restoration], MON, calendar())).toBe('8h')
  })

  it('still reads sanely before the opening hours have loaded', async () => {
    renderCards([restoration], [MON], null)

    // No hours to go by, so the technician's own day is the most it can take.
    expect(figures()).toEqual(['8h / 8h'])
    expect(await timelineBooked([restoration], MON, null)).toBe('8h')
  })

  it('counts a same-day job in full, the part after closing included', async () => {
    const lateJob = job('late', 'Clutch', `${MON}T13:00:00`, `${MON}T19:00:00`)
    renderCards([lateJob], [MON], calendar())

    // Closing is 16:00, and the three hours after it are still work.
    expect(figures()).toEqual(['6h / 8h'])
    expect(await timelineBooked([lateJob], MON, calendar())).toBe('6h')
  })

  it('adds nothing from a long job on a day the workshop is closed', async () => {
    const closed = calendar({
      closures: [{ name: 'Armistice Day', source: 'holiday', startDate: WED, endDate: WED }],
    })
    renderCards([restoration], [TUE, WED], closed)

    // The job is still drawn on the closed day; it just fills none of it.
    expect(screen.getAllByText('Dauphine restoration')).toHaveLength(2)
    expect(figures()).toEqual(['8h / 8h'])
    expect(await timelineBooked([restoration], WED, closed)).toBe('0min')
  })

  it('adds nothing from a long job on a day the technician is away', () => {
    const away = calendar({
      absences: [
        { id: 'a1', technicianId: 'ada', startDate: TUE, endDate: TUE, reason: 'holiday' },
      ],
    })
    renderCards([restoration], [MON, TUE], away)

    expect(figures()).toEqual(['8h / 8h'])
  })

  it('still counts a job booked for the closed day itself', () => {
    const closed = calendar({
      closures: [{ name: 'Armistice Day', source: 'holiday', startDate: WED, endDate: WED }],
    })
    const favour = job('favour', 'Bulb change', `${WED}T10:00:00`, `${WED}T11:00:00`)
    renderCards([restoration, favour], [WED], closed)

    expect(figures()).toEqual(['1h / 8h'])
  })

  it('adds three long jobs on one day up to three working days', async () => {
    const jobs = [restoration, engineRebuild, respray]
    renderCards(jobs, [MON], calendar())

    expect(figures()).toEqual(['24h / 8h'])
    expect(await timelineBooked(jobs, MON, calendar())).toBe('24h')
  })

  it('says how far over a day is, so nobody has to subtract', () => {
    renderCards([restoration, engineRebuild, respray], [MON], calendar())

    expect(screen.getByText('· 16h over')).toBeInTheDocument()
    // And as one statement for somebody who hears the board.
    expect(screen.getByText('24h booked of 8h, 16h over')).toBeInTheDocument()
  })

  it('says a part of an hour over the way the board writes any duration', () => {
    const long = job('long', 'Timing belt', `${MON}T08:00:00`, `${MON}T16:30:00`)
    renderCards([long], [MON], calendar())

    expect(figures()).toEqual(['8h 30min / 8h'])
    expect(screen.getByText('· 30min over')).toBeInTheDocument()
  })

  it('says nothing about being over on a day that is full or has room', () => {
    const short = job('short', 'Oil change', `${TUE}T09:00:00`, `${TUE}T10:00:00`)
    renderCards([restoration, { ...short, technicianId: 'sam' }], [MON, TUE], calendar())

    expect(figures()).toEqual(['8h / 8h', '8h / 8h', '1h / 8h'])
    expect(screen.queryByText(/over$/)).toBeNull()
    expect(screen.getByText('1h booked of 8h')).toBeInTheDocument()
  })

  it('says the same in the timeline, for the eye and for the ear', async () => {
    const jobs = [restoration, engineRebuild, respray]
    expect(await timelineBooked(jobs, MON, calendar())).toBe('24h')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Over by16h')
    expect(screen.getByRole('button', { name: /^Ada/ })).toHaveTextContent(
      '24h booked of 8h, 16h over'
    )
  })

  it('counts the first and last day of a long job from when it starts and to when it ends', () => {
    const overnight = job('gearbox', 'Gearbox', `${MON}T14:00:00`, `${WED}T10:00:00`)
    renderCards([overnight], [MON, TUE, WED], calendar())

    // 14:00 to closing, a whole day, opening to 10:00.
    expect(figures()).toEqual(['2h / 8h', '8h / 8h', '2h / 8h'])
  })

  it('fills the day of a helper on a long job as it fills the technician’s', () => {
    const shared = { ...restoration, helperIds: ['sam'] }
    renderCards([shared], [MON], calendar())

    expect(figures()).toEqual(['8h / 8h', '8h / 8h'])
  })
})
