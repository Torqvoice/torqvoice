/**
 * Completing a job ends a booked slot still ahead of it, on the server. The
 * work order's time card kept showing tomorrow's slot until the page was
 * reloaded; it now shows the times the job holds once the page refreshes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ dateFormat: 'yyyy-MM-dd', timeFormat: '24h', timezone: 'UTC' }),
}))
vi.mock('@/features/team/Components/AddPersonDialog', () => ({ AddPersonDialog: () => null }))
// The picker shows the time it holds, which is all this test reads.
vi.mock('@/components/ui/datetime-picker', () => ({
  DateTimePicker: ({ value }: { value?: Date }) => (
    <output data-testid="picked">{value ? value.toISOString() : ''}</output>
  ),
}))
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
  checkSlotAvailability,
  getTechnicianDayLoad,
} from '@/features/workboard/Actions/boardActions'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { ScheduleTimesSection } from '@/features/vehicles/Components/service-edit/ScheduleTimesSection'

function card(start: string, end: string) {
  return (
    <WorkOrderLayoutProvider value={true}>
      <ScheduleTimesSection
        serviceRecordId="job-1"
        technicians={[]}
        initialStartDateTime={start}
        initialEndDateTime={end}
        initialTechnicianId={null}
        initialHelperIds={[]}
      />
    </WorkOrderLayoutProvider>
  )
}

beforeEach(() => {
  vi.mocked(checkSlotAvailability).mockResolvedValue({
    success: true,
    data: { conflicts: [], closures: [], closedWeekday: false },
  } as never)
  vi.mocked(getTechnicianDayLoad).mockResolvedValue({
    success: true,
    data: { minutes: {}, away: {} },
  } as never)
})

describe('the time card on a job that was just completed', () => {
  it('shows the times the server moved the job to', async () => {
    const { rerender } = render(card('2026-11-25T07:00:00.000Z', '2026-11-25T08:00:00.000Z'))
    expect(screen.getAllByTestId('picked').map((p) => p.textContent)).toContain(
      '2026-11-25T07:00:00.000Z'
    )

    rerender(card('2026-11-24T18:48:00.000Z', '2026-11-24T18:48:00.000Z'))

    const shown = (await screen.findAllByTestId('picked')).map((p) => p.textContent)
    expect(shown).toContain('2026-11-24T18:48:00.000Z')
    expect(shown).not.toContain('2026-11-25T07:00:00.000Z')
  })
})
