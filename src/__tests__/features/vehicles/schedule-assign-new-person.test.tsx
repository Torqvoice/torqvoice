/**
 * Who has the job, on the work order's "Assigned technician" card.
 *
 * - With nobody on the job the card says so, rather than listing the board's
 *   technicians under "Assigned technician" as if they all had it.
 * - Somebody added through "Add someone new" is in the cards at once and
 *   leads the job: the desk opened the dialog from this job to give it to them.
 * - Somebody added elsewhere shows up when the page reads the list again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ dateFormat: 'yyyy-MM-dd', timeFormat: '24h', timezone: 'UTC' }),
}))
// The dialog's own steps are tested with it; here it only reports who it added.
vi.mock('@/features/team/Components/AddPersonDialog', () => ({
  AddPersonDialog: ({
    onChanged,
  }: {
    onChanged: (added?: { technicianId: string; name: string; userId: string | null }) => void
  }) => (
    <button
      type="button"
      onClick={() => onChanged({ technicianId: 'new-tech', name: 'ZZ New Starter', userId: null })}
    >
      finish adding
    </button>
  ),
}))
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

import {
  assignTechnician,
  checkSlotAvailability,
  getTechnicianDayLoad,
} from '@/features/workboard/Actions/boardActions'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { ScheduleTimesSection } from '@/features/vehicles/Components/service-edit/ScheduleTimesSection'

const technicians = [
  { id: 'andy', name: 'Andy Campbell' },
  { id: 'sam', name: 'Sam Reid' },
]

function card(technicianId: string | null, list = technicians) {
  return (
    <WorkOrderLayoutProvider value={true}>
      <ScheduleTimesSection
        serviceRecordId="job-1"
        technicians={list}
        initialStartDateTime="2026-11-10T08:00:00.000Z"
        initialEndDateTime="2026-11-10T11:00:00.000Z"
        initialTechnicianId={technicianId}
        initialHelperIds={[]}
      />
    </WorkOrderLayoutProvider>
  )
}

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

describe('the assigned technician card', () => {
  it('says the job is not assigned when nobody has it, and checks nobody', () => {
    render(card(null))

    expect(screen.getByText('Not assigned yet. Choose who does this job.')).toBeInTheDocument()
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('says nothing of the kind once somebody has the job', () => {
    render(card('andy'))

    expect(screen.queryByText('Not assigned yet. Choose who does this job.')).toBeNull()
    expect(screen.getByRole('radio', { name: /Andy Campbell/ })).toBeChecked()
  })

  it('puts somebody added with "Add someone new" on the job at once', async () => {
    vi.mocked(assignTechnician).mockResolvedValue({
      success: true,
      data: { id: 'job-1', technicianId: 'new-tech', helperIds: [] },
    } as never)
    render(card(null))

    await userEvent.click(screen.getByRole('button', { name: 'finish adding' }))

    // In the cards without a reload, and leading the job.
    expect(screen.getByRole('radio', { name: /ZZ New Starter/ })).toBeChecked()
    expect(screen.queryByText('Not assigned yet. Choose who does this job.')).toBeNull()
    expect(assignTechnician).toHaveBeenCalledWith({
      id: 'job-1',
      technicianId: 'new-tech',
      type: 'serviceRecord',
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('lists somebody added elsewhere when the page reads the list again', () => {
    const { rerender } = render(card('andy'))
    expect(screen.queryByRole('radio', { name: /Jo Mills/ })).toBeNull()

    rerender(card('andy', [...technicians, { id: 'jo', name: 'Jo Mills' }]))

    expect(screen.getByRole('radio', { name: /Jo Mills/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Andy Campbell/ })).toBeChecked()
  })
})
