/**
 * A job on the timeline says the workshop's time, not the browser's.
 *
 * The workshop here is on UTC and the browser in Oslo, an hour ahead in
 * November. A job booked 11:48 to 12:48 UTC is at 11:48 on the work order
 * page and in the board's own dialog, so the block has to say 11:48 too.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import { WeekTimeline } from '@/features/workboard/Components/WeekTimeline'
import { buildLanes } from '@/features/workboard/utils/lanes'
import { toBoardJob } from '@/features/workboard/utils/board-time'
import type { Technician } from '@/features/workboard/store/workboardStore'

const WORKSHOP_ZONE = 'UTC'

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: WORKSHOP_ZONE,
    weekStartDay: 1,
  }),
}))

const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/Oslo'
})
afterAll(() => {
  process.env.TZ = originalTz
})

const DAY = '2026-11-10'

const ada: Technician = {
  id: 'ada',
  name: 'Ada',
  color: '#3b82f6',
  isActive: true,
  sortOrder: 0,
  dailyCapacity: 480,
  userId: null,
  organizationId: 'org-a',
}

/** As the store holds it: real instants, as the server sends them. */
const brakeJob: WorkBoardJob = {
  id: 'brake',
  type: 'serviceRecord',
  technicianId: 'ada',
  helperIds: [],
  workBayId: null,
  customerName: null,
  sortOrder: 0,
  title: 'Brake job',
  status: 'pending',
  startDateTime: `${DAY}T11:48:00.000Z`,
  endDateTime: `${DAY}T12:48:00.000Z`,
  promisedAt: null,
  vehicle: null,
}

function renderTimeline(jobs: WorkBoardJob[]) {
  const lanes = buildLanes({
    grouping: 'technician',
    technicians: [ada],
    workBays: [],
    jobs,
    labels: { unlaned: 'No technician', all: 'Everyone' },
  })
  render(
    <TooltipProvider>
      <DndContext>
        <WeekTimeline
          days={[DAY]}
          lanes={lanes}
          jobs={jobs}
          grouping="technician"
          zoom={1}
          snapMinutes={15}
          workDayStart="07:00"
          workDayEnd="17:00"
          onOpenJob={vi.fn()}
          onSchedule={vi.fn()}
        />
      </DndContext>
    </TooltipProvider>
  )
}

describe('the timeline in a workshop on UTC, seen from a browser in Oslo', () => {
  it('labels the block with the workshop’s 11:48 to 12:48', () => {
    // What the board client now hands the timeline.
    renderTimeline([toBoardJob(brakeJob, WORKSHOP_ZONE)])

    expect(screen.getByRole('button', { name: /^11:48 – 12:48 Brake job/ })).toBeInTheDocument()
  })

  it('would say the browser’s 12:48 if the stored job were drawn as it is', () => {
    // The bug this guards against, so the test above cannot pass by accident
    // in a process that happens to run on UTC.
    renderTimeline([brakeJob])

    expect(screen.getByRole('button', { name: /^12:48 – 13:48 Brake job/ })).toBeInTheDocument()
  })
})
