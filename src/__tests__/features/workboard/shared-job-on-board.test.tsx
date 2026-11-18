/**
 * A job two people are on, as the work board draws it.
 *
 * The board plans a person's day, so the apprentice's lane has to show the
 * job they are helping on: an empty lane would say they are free. But there
 * is still one job, and one card that moves it. So the technician's lane has
 * the card, marked as shared, and the helper's lane has an outline of the
 * same job that says whose it is.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '@/features/workboard/Actions/boardActions'
import { WeekCardGrid } from '@/features/workboard/Components/WeekCardGrid'
import { PresenterKanbanView } from '@/features/workboard/Components/PresenterKanbanView'
import { type LaneGrouping, buildLanes, groupJobsByLane } from '@/features/workboard/utils/lanes'
import type { Technician } from '@/features/workboard/store/workboardStore'

const DAY = '2026-09-01'

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

const technicians = [technician('andy', 'Andy', 0), technician('sam', 'Sam', 1)]
const workBays = [
  {
    id: 'lift-1',
    name: 'Lift 1',
    color: '#64748b',
    isActive: true,
    sortOrder: 0,
    dailyCapacity: 480,
    organizationId: 'org-a',
  },
]

const truck: WorkBoardJob = {
  id: 'truck',
  type: 'serviceRecord',
  technicianId: 'andy',
  helperIds: ['sam'],
  workBayId: 'lift-1',
  customerName: null,
  sortOrder: 0,
  title: 'Truck service',
  status: 'in-progress',
  startDateTime: `${DAY}T09:00:00`,
  endDateTime: `${DAY}T12:00:00`,
  promisedAt: null,
  vehicle: null,
}

const lookup = new Map([
  ['andy', { name: 'Andy', color: '#3b82f6' }],
  ['sam', { name: 'Sam', color: '#22c55e' }],
  ['lift-1', { name: 'Lift 1', color: '#64748b' }],
])

function renderWeek(grouping: LaneGrouping, onOpenJob = vi.fn()) {
  const lanes = buildLanes({
    grouping,
    technicians,
    workBays,
    jobs: [truck],
    labels: { unlaned: 'No technician', all: 'Everyone' },
  })
  render(
    <TooltipProvider>
      <DndContext>
        <WeekCardGrid
          days={[DAY]}
          lanes={lanes}
          jobsByLane={groupJobsByLane([truck], grouping)}
          todayStr={DAY}
          timeFormat="24h"
          lookup={lookup}
          onOpenJob={onOpenJob}
        />
      </DndContext>
    </TooltipProvider>
  )
  return onOpenJob
}

describe('a shared job on the week board', () => {
  it('is a card in the technician’s lane and an outline in the helper’s', () => {
    renderWeek('technician')

    // One job, drawn twice.
    expect(screen.getAllByText('Truck service')).toHaveLength(2)
    const shadows = screen.getAllByTestId('job-shadow')
    expect(shadows).toHaveLength(1)
    expect(within(shadows[0]).getByText('With Andy')).toBeInTheDocument()
  })

  it('says on the card itself that somebody else is on it', () => {
    renderWeek('technician')

    expect(screen.getByTestId('job-team-count')).toHaveTextContent('+1')
  })

  it('fills the helper’s day as well as the technician’s', () => {
    renderWeek('technician')

    // Three hours of an eight-hour day, in both lanes.
    expect(screen.getAllByText('3h / 8h')).toHaveLength(2)
  })

  it('opens the job from the outline', async () => {
    const onOpenJob = renderWeek('technician')

    screen.getByTestId('job-shadow').click()

    expect(onOpenJob).toHaveBeenCalledWith(truck)
  })

  it('is one card when the board is grouped by bay, still marked as shared', () => {
    renderWeek('bay')

    expect(screen.getAllByText('Truck service')).toHaveLength(1)
    expect(screen.queryByTestId('job-shadow')).toBeNull()
    expect(screen.getByTestId('job-team-count')).toHaveTextContent('+1')
  })
})

describe('a shared job on the wall screen', () => {
  it('is in the row of everybody on it, and says whose it is', () => {
    render(<PresenterKanbanView date={DAY} technicians={technicians} assignments={[truck]} />)

    expect(screen.getAllByText('Truck service')).toHaveLength(2)
    expect(within(screen.getByTestId('job-shadow')).getByText('With Andy')).toBeInTheDocument()
    // Each of them has one job today.
    expect(screen.getAllByText('1 job')).toHaveLength(2)
  })
})
