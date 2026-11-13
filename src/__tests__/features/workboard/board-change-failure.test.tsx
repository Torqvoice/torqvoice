/**
 * A job moved on the work board is drawn in its new place before the server
 * has it. When the move never reaches the server the job goes back where it
 * was and the board says so; a job dragged out of the unassigned list goes
 * back into the list. Both used to stay where they were dropped, showing a
 * change the server never made.
 *
 * Moves that overlap are settled together: two that both fail leave the job
 * where it started, whichever answers first, and one that fails after a later
 * one went through does not undo it.
 *
 * Dragging in jsdom is not practical, so the timeline is a stand-in that
 * draws the jobs it is handed and keeps the board's own `onSchedule`, and the
 * drag context keeps the board's own `onDragEnd`. Those handlers are the ones
 * the real timeline and drag context call.
 */
import type { DragEndEvent } from '@dnd-kit/core'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkBoardJob, WorkBoardSettings } from '@/features/workboard/Actions/boardActions'
import type { WeekScheduleChange } from '@/features/workboard/Components/WeekTimeline'
import type { Technician } from '@/features/workboard/store/workboardStore'

const toastError = vi.fn()
const scheduleJob = vi.fn()
const getBoardJobs = vi.fn()
const getUnassignedJobs = vi.fn()
/** The board's own handlers, as the timeline and the drag context receive them. */
const board: {
  jobs: WorkBoardJob[]
  onSchedule?: (change: WeekScheduleChange) => unknown
  onDragEnd?: (event: DragEndEvent) => unknown
} = { jobs: [] }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/work-board',
}))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}))
vi.mock('@/features/workboard/Actions/boardActions', () => ({
  getBoardJobs: (...args: unknown[]) => getBoardJobs(...args),
  getUnassignedJobs: (...args: unknown[]) => getUnassignedJobs(...args),
  scheduleJob: (...args: unknown[]) => scheduleJob(...args),
  assignTechnician: vi.fn(),
  moveJob: vi.fn(),
  unassignJob: vi.fn(),
  updateServiceTimes: vi.fn(),
}))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: 'UTC',
    weekStartDay: 1,
  }),
}))
vi.mock('@/features/workboard/hooks/useWorkBoardWebSocket', () => ({
  useWorkBoardWebSocket: () => undefined,
}))
vi.mock('@/features/workboard/hooks/useBoardCalendar', () => ({
  awayKey: (laneId: string, date: string) => `${laneId}|${date}`,
  useBoardCalendar: () => ({
    calendar: null,
    enabled: false,
    closedByDay: {},
    awayByLaneDay: {},
    reload: vi.fn(),
  }),
}))
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  DndContext: (props: { onDragEnd: (event: DragEndEvent) => unknown; children: ReactNode }) => {
    board.onDragEnd = props.onDragEnd
    return <>{props.children}</>
  },
  DragOverlay: () => null,
}))
vi.mock('@/features/workboard/Components/WeekTimeline', () => ({
  WeekTimeline: (props: {
    jobs: WorkBoardJob[]
    onSchedule: (change: WeekScheduleChange) => unknown
  }) => {
    board.jobs = props.jobs
    board.onSchedule = props.onSchedule
    return (
      <ul aria-label="Board">
        {props.jobs.map((job) => (
          <li key={job.id}>{`${job.title}, ${job.technicianId}, ${job.startDateTime}`}</li>
        ))}
      </ul>
    )
  },
}))
vi.mock('@/features/workboard/Components/UnassignedJobsPanel', async () => {
  const { useWorkBoardStore } = await import('@/features/workboard/store/workboardStore')
  return {
    UnassignedJobsPanel: () => {
      const pool = useWorkBoardStore((state) => state.unassignedServiceRecords)
      return (
        <ul aria-label="Unassigned">
          {pool.map((job) => (
            <li key={job.id}>{job.title}</li>
          ))}
        </ul>
      )
    },
    UnassignedJobsList: () => null,
  }
})
vi.mock('@/features/workboard/Components/WorkBoardToolbar', () => ({
  WorkBoardToolbar: () => null,
}))
vi.mock('@/features/workboard/Components/WeekCardGrid', () => ({ WeekCardGrid: () => null }))
vi.mock('@/features/workboard/Components/TechnicianDialog', () => ({
  TechnicianDialog: () => null,
}))
vi.mock('@/features/workboard/Components/WorkBayDialog', () => ({ WorkBayDialog: () => null }))
vi.mock('@/features/workboard/Components/JobDetailPopover', () => ({
  JobDetailPopover: () => null,
}))
vi.mock('@/features/workshop-calendar/Components/TimeOffDialog', () => ({
  TimeOffDialog: () => null,
}))
vi.mock('@/features/workshop-calendar/Components/TimeOffManagerDialog', () => ({
  TimeOffManagerDialog: () => null,
}))
vi.mock('@/components/vehicle-picker-dialog', () => ({ VehiclePickerDialog: () => null }))
vi.mock('@/components/ui/drawer', () => ({
  Drawer: () => null,
  DrawerContent: () => null,
  DrawerHeader: () => null,
  DrawerTitle: () => null,
  DrawerTrigger: () => null,
}))

import { WorkBoardClient } from '@/features/workboard/Components/WorkBoardClient'

const WEEK = '2026-11-09'

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

const BRAKES: WorkBoardJob = {
  id: 'brakes',
  type: 'serviceRecord',
  technicianId: 'ada',
  helperIds: [],
  workBayId: null,
  sortOrder: 0,
  title: 'Brake job',
  status: 'pending',
  startDateTime: '2026-11-10T09:00:00.000Z',
  endDateTime: '2026-11-10T10:00:00.000Z',
  promisedAt: null,
  vehicle: null,
  customerName: null,
}

const SETTINGS: WorkBoardSettings = { weekStartDay: 1, workDayStart: '08:00', workDayEnd: '16:00' }

const OIL_CHANGE = {
  id: 'oil',
  title: 'Oil change',
  status: 'pending',
  vehicle: { id: 'v1', make: 'Volvo', model: 'V70', year: 2012, licensePlate: 'AB12345' },
}

const renderBoard = () =>
  render(
    <WorkBoardClient
      initialTechnicians={[
        technician('ada', 'Ada', 0),
        technician('grace', 'Grace', 1),
        technician('lin', 'Lin', 2),
      ]}
      initialWorkBays={[]}
      initialAssignments={[BRAKES]}
      initialUnassigned={{ serviceRecords: [OIL_CHANGE], inspections: [] }}
      initialWeekStart={WEEK}
      boardSettings={SETTINGS}
    />
  )

const onBoard = () => within(screen.getByRole('list', { name: 'Board' }))
const brakeJob = () => onBoard().getByText(/^Brake job,/).textContent
const inPool = () => within(screen.getByRole('list', { name: 'Unassigned' }))

/**
 * Drags the brake job, as the timeline has it drawn now, into another
 * technician's lane an hour later. What the timeline does on a drop.
 */
const moveBrakeJob = (laneId: string) => {
  const drawn = board.jobs.find((job) => job.id === BRAKES.id)
  if (!drawn) throw new Error('The brake job is not on the board')
  return board.onSchedule?.({
    job: drawn,
    laneId,
    start: new Date('2026-11-10T10:00:00'),
    end: new Date('2026-11-10T11:00:00'),
  })
}

const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

const unreachable = async () => {
  throw new TypeError('Failed to fetch')
}

describe('a change on the work board that does not go through', () => {
  beforeEach(() => {
    scheduleJob.mockReset()
    getBoardJobs.mockReset()
    getUnassignedJobs.mockReset()
    toastError.mockClear()
    getUnassignedJobs.mockResolvedValue({
      success: true,
      data: { serviceRecords: [], inspections: [] },
    })
  })

  it('puts a moved job back where it was when the move never reaches the server', async () => {
    const answer = gate()
    scheduleJob.mockImplementation(async () => {
      await answer.opened
      throw new TypeError('Failed to fetch')
    })
    renderBoard()
    const before = brakeJob()
    expect(before).toContain(', ada,')

    act(() => void moveBrakeJob('grace'))
    expect(brakeJob()).toContain(', grace,')

    await act(async () => answer.open())

    await waitFor(() => expect(brakeJob()).toBe(before))
    expect(toastError).toHaveBeenCalledWith('Failed to move assignment', {
      description: undefined,
    })
  })

  it('puts a job dragged from the unassigned list back in the list when the assignment never reaches the server', async () => {
    scheduleJob.mockImplementation(unreachable)
    renderBoard()
    expect(inPool().getByText('Oil change')).toBeInTheDocument()

    await act(async () => {
      await board.onDragEnd?.({
        active: { id: 'oil', data: { current: { job: OIL_CHANGE, type: 'serviceRecord' } } },
        over: {
          id: 'ada|2026-11-10',
          data: { current: { laneId: 'ada', date: '2026-11-10', week: true } },
        },
        activatorEvent: new Event('pointerdown'),
        delta: { x: 0, y: 0 },
      } as unknown as DragEndEvent)
    })

    expect(scheduleJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'oil', technicianId: 'ada' })
    )
    expect(inPool().getByText('Oil change')).toBeInTheDocument()
    expect(onBoard().queryByText(/^Oil change/)).not.toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('Failed to assign job', { description: undefined })
  })

  it('leaves the job where it started when two moves both fail, the first answering first', async () => {
    const first = gate()
    const second = gate()
    scheduleJob
      .mockImplementationOnce(async () => {
        await first.opened
        return { success: false, error: 'Refused' }
      })
      .mockImplementationOnce(async () => {
        await second.opened
        return { success: false, error: 'Refused' }
      })
    renderBoard()
    const before = brakeJob()

    act(() => void moveBrakeJob('grace'))
    act(() => void moveBrakeJob('lin'))
    expect(brakeJob()).toContain(', lin,')

    await act(async () => first.open())
    await act(async () => second.open())

    await waitFor(() => expect(brakeJob()).toBe(before))
    expect(toastError).toHaveBeenCalledTimes(2)
  })

  it('does not undo a later move that went through when an earlier one fails, and reads the board back', async () => {
    const first = gate()
    const onLin = { ...BRAKES, technicianId: 'lin' }
    scheduleJob
      .mockImplementationOnce(async () => {
        await first.opened
        return { success: false, error: 'Refused' }
      })
      .mockImplementationOnce(async () => ({ success: true, data: onLin }))
    getBoardJobs.mockResolvedValue({ success: true, data: [onLin] })
    renderBoard()

    act(() => void moveBrakeJob('grace'))
    await act(async () => {
      await moveBrakeJob('lin')
    })
    expect(brakeJob()).toContain(', lin,')
    await act(async () => first.open())

    await waitFor(() => expect(getBoardJobs).toHaveBeenCalledWith(WEEK))
    await waitFor(() => expect(brakeJob()).toContain(', lin,'))
    expect(toastError).toHaveBeenCalledWith('Failed to move assignment', {
      description: 'Refused',
    })
  })
})
