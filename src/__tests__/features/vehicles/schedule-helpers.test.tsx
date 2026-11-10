/**
 * Putting more than one person on a job, from the work order.
 *
 * The card lists the workshop's technicians. Choosing a name gives that
 * person the job, as it always did. Once somebody has it, every other name
 * gains a mark that puts them on the job as well: an apprentice working with
 * whoever is teaching them, a second pair of hands on a truck.
 *
 * What a service advisor has to be able to rely on:
 *
 * - nobody can help on a job that nobody has;
 * - a helper who is given the job swaps with whoever had it, so the same
 *   people are still on it;
 * - taking the technician off takes the helpers off too;
 * - a clash says who is double-booked once the job is more than one person.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The "Someone else" list measures its popover; jsdom has no ResizeObserver,
// and nothing here needs measuring.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ dateFormat: 'yyyy-MM-dd', timeFormat: '24h', timezone: 'UTC' }),
}))
vi.mock('@/features/team/Components/AddPersonDialog', () => ({ AddPersonDialog: () => null }))
vi.mock('@/components/ui/datetime-picker', () => ({ DateTimePicker: () => null }))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({ createTechnician: vi.fn() }))
vi.mock('@/features/workboard/Actions/boardActions', () => ({
  addJobHelper: vi.fn(),
  removeJobHelper: vi.fn(),
  assignTechnician: vi.fn(),
  scheduleJob: vi.fn(),
  checkSlotAvailability: vi.fn(),
  findNextSlot: vi.fn(),
  getTechnicianDayLoad: vi.fn(),
  setPromisedTime: vi.fn(),
  updateServiceTimes: vi.fn(),
}))

import { toast } from 'sonner'
import {
  addJobHelper,
  assignTechnician,
  checkSlotAvailability,
  findNextSlot,
  getTechnicianDayLoad,
  removeJobHelper,
  scheduleJob,
} from '@/features/workboard/Actions/boardActions'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { ScheduleTimesSection } from '@/features/vehicles/Components/service-edit/ScheduleTimesSection'

const technicians = [
  { id: 'andy', name: 'Andy Campbell' },
  { id: 'sam', name: 'Sam Reid' },
  { id: 'jo', name: 'Jo Mills' },
]

/** The job as the server hands it back after a change. */
const jobWith = (technicianId: string | null, helperIds: string[]) =>
  ({ success: true, data: { id: 'job-1', technicianId, helperIds } }) as never

function renderCard(props: { technicianId?: string | null; helperIds?: string[] } = {}) {
  return render(
    <WorkOrderLayoutProvider value={true}>
      <ScheduleTimesSection
        serviceRecordId="job-1"
        technicians={technicians}
        initialStartDateTime="2026-11-10T08:00:00.000Z"
        initialEndDateTime="2026-11-10T11:00:00.000Z"
        initialTechnicianId={props.technicianId === undefined ? 'andy' : props.technicianId}
        initialHelperIds={props.helperIds ?? []}
      />
    </WorkOrderLayoutProvider>
  )
}

const row = (name: string) => screen.getByRole('radio', { name: new RegExp(name) }).parentElement!
const addButton = (name: string) =>
  screen.queryByRole('button', { name: `Add ${name} to this job` })
const removeButton = (name: string) =>
  screen.queryByRole('button', { name: `Take ${name} off this job` })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkSlotAvailability).mockResolvedValue({
    success: true,
    data: { conflicts: [], closures: [], closedWeekday: false },
  } as never)
  vi.mocked(getTechnicianDayLoad).mockResolvedValue({
    success: true,
    data: { minutes: {}, away: {} },
  } as never)
})

describe('who is on the job, on the work order', () => {
  it('offers to add everybody but the technician, who is on it already', () => {
    renderCard()

    expect(screen.getByRole('radio', { name: /Andy Campbell/ })).toBeChecked()
    expect(addButton('Andy Campbell')).toBeNull()
    expect(addButton('Sam Reid')).toBeInTheDocument()
    expect(addButton('Jo Mills')).toBeInTheDocument()
  })

  it('offers nobody as a helper while the job has no technician', () => {
    renderCard({ technicianId: null })

    expect(addButton('Sam Reid')).toBeNull()
    expect(addButton('Jo Mills')).toBeNull()
  })

  it('puts a second person on the job and says so on their row', async () => {
    vi.mocked(addJobHelper).mockResolvedValue(jobWith('andy', ['sam']))
    renderCard()

    await userEvent.click(addButton('Sam Reid')!)

    expect(addJobHelper).toHaveBeenCalledWith({ id: 'job-1', technicianId: 'sam' })
    expect(within(row('Sam Reid')).getByText('Also on this job')).toBeInTheDocument()
    expect(removeButton('Sam Reid')).toBeInTheDocument()
    // Andy still has the job, and now says he leads it.
    expect(screen.getByRole('radio', { name: /Andy Campbell/ })).toBeChecked()
    expect(within(row('Andy Campbell')).getByText('Lead')).toBeInTheDocument()
  })

  it('does not call a lone technician the lead', () => {
    renderCard()

    expect(screen.queryByText('Lead')).toBeNull()
  })

  it('takes a helper off again', async () => {
    vi.mocked(removeJobHelper).mockResolvedValue(jobWith('andy', []))
    renderCard({ helperIds: ['sam'] })

    await userEvent.click(removeButton('Sam Reid')!)

    expect(removeJobHelper).toHaveBeenCalledWith({ id: 'job-1', technicianId: 'sam' })
    expect(screen.queryByText('Also on this job')).toBeNull()
    expect(addButton('Sam Reid')).toBeInTheDocument()
  })

  it('swaps the two when a helper is given the job', async () => {
    vi.mocked(assignTechnician).mockResolvedValue(jobWith('sam', ['andy']))
    renderCard({ helperIds: ['sam'] })

    await userEvent.click(screen.getByRole('radio', { name: /Sam Reid/ }))

    expect(screen.getByRole('radio', { name: /Sam Reid/ })).toBeChecked()
    expect(within(row('Sam Reid')).getByText('Lead')).toBeInTheDocument()
    // Andy is still on the job, now as the one helping.
    expect(within(row('Andy Campbell')).getByText('Also on this job')).toBeInTheDocument()
  })

  it('keeps the helper when somebody new is given the job', async () => {
    vi.mocked(assignTechnician).mockResolvedValue(jobWith('jo', ['sam']))
    renderCard({ helperIds: ['sam'] })

    await userEvent.click(screen.getByRole('radio', { name: /Jo Mills/ }))

    expect(screen.getByRole('radio', { name: /Jo Mills/ })).toBeChecked()
    expect(within(row('Sam Reid')).getByText('Also on this job')).toBeInTheDocument()
    expect(within(row('Andy Campbell')).queryByText('Also on this job')).toBeNull()
  })

  it('takes the helpers off with the technician', async () => {
    vi.mocked(scheduleJob).mockResolvedValue(jobWith(null, []))
    renderCard({ helperIds: ['sam'] })

    await userEvent.click(screen.getByRole('button', { name: 'Someone else' }))
    await userEvent.click(await screen.findByRole('option', { name: 'No technician' }))

    await waitFor(() => expect(screen.queryByText('Also on this job')).toBeNull())
    expect(removeButton('Sam Reid')).toBeNull()
    expect(addButton('Sam Reid')).toBeNull()
  })

  it('puts things back, and says so, when the helper could not be saved', async () => {
    vi.mocked(addJobHelper).mockResolvedValue({ success: false, error: 'nope' } as never)
    renderCard()

    await userEvent.click(addButton('Sam Reid')!)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update who is on the job')
    )
    expect(screen.queryByText('Also on this job')).toBeNull()
    expect(addButton('Sam Reid')).toBeInTheDocument()
  })

  it('shows who is on the job when the page reads it again', () => {
    // The board, or somebody at another desk, added Sam meanwhile.
    const { rerender } = renderCard()
    expect(screen.queryByText('Also on this job')).toBeNull()

    rerender(
      <WorkOrderLayoutProvider value={true}>
        <ScheduleTimesSection
          serviceRecordId="job-1"
          technicians={technicians}
          initialStartDateTime="2026-11-10T08:00:00.000Z"
          initialEndDateTime="2026-11-10T11:00:00.000Z"
          initialTechnicianId="andy"
          initialHelperIds={['sam']}
        />
      </WorkOrderLayoutProvider>
    )

    expect(within(row('Sam Reid')).getByText('Also on this job')).toBeInTheDocument()
  })
})

describe('booking a job that is more than one person', () => {
  it('checks the slot for everybody on it', async () => {
    renderCard({ helperIds: ['sam'] })

    await waitFor(() =>
      expect(checkSlotAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ technicianId: 'andy', helperIds: ['sam'] })
      )
    )
  })

  it('names the person who is double-booked', async () => {
    vi.mocked(checkSlotAvailability).mockResolvedValue({
      success: true,
      data: {
        conflicts: [
          {
            id: 'other-job',
            kind: 'serviceRecord',
            label: 'Volvo V60',
            start: '2026-11-10T09:00:00.000Z',
            end: '2026-11-10T10:00:00.000Z',
            onTechnician: true,
            onBay: false,
            people: ['sam'],
          },
        ],
        closures: [],
        closedWeekday: false,
      },
    } as never)

    renderCard({ helperIds: ['sam'] })

    expect(await screen.findByText(/Sam Reid is busy/)).toBeInTheDocument()
  })

  it('looks for the next slot the whole team is free for', async () => {
    vi.mocked(findNextSlot).mockResolvedValue({
      success: true,
      data: { start: null, end: null },
    } as never)
    renderCard({ helperIds: ['sam', 'jo'] })

    await userEvent.click(screen.getByRole('button', { name: 'Pick next available slot' }))

    expect(findNextSlot).toHaveBeenCalledWith(
      expect.objectContaining({ technicianId: 'andy', helperIds: ['sam', 'jo'] })
    )
  })
})
