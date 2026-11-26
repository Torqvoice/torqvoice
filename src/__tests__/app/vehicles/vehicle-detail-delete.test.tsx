/**
 * Deleting a vehicle from its page: the question is the shared confirmation
 * dialog, it names the vehicle and its plate, opens on Cancel, and nothing is
 * deleted until the red button is pressed.
 */
import type { ReactElement } from 'react'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { render as renderBare, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The page's query string: which list is showing. */
const url = vi.hoisted(() => ({ query: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(url.query),
  usePathname: () => '/vehicles/v1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/vehicles/Actions/dismissMaintenance', () => ({
  dismissMaintenance: vi.fn(),
  undismissMaintenance: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({ createServiceRecord: vi.fn() }))
vi.mock('@/features/vehicles/Actions/findingActions', () => ({ deleteFinding: vi.fn() }))
vi.mock('@/features/vehicles/Actions/noteActions', () => ({
  deleteNote: vi.fn(),
  toggleNotePin: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  toggleReminder: vi.fn(),
  deleteReminder: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/unarchiveVehicle', () => ({ unarchiveVehicle: vi.fn() }))
vi.mock('@/features/vehicles/Actions/deleteVehicle', () => ({ deleteVehicle: vi.fn() }))
vi.mock('@/features/ai/Actions/aiActions', () => ({
  aiSummarizeVehicleHistory: vi.fn(),
  aiGetCommonIssues: vi.fn(),
  aiClearMessage: vi.fn(),
}))
// Screens and dialogs of their own.
// The edit form hands its Delete button to the page, which asks the question.
vi.mock('@/features/vehicles/Components/VehicleForm', () => ({
  VehicleForm: ({ onDelete }: { onDelete?: () => void }) => (
    <button type="button" onClick={onDelete}>
      Delete from the edit form
    </button>
  ),
}))
vi.mock('@/features/vehicles/Components/NoteForm', () => ({ NoteForm: () => null }))
vi.mock('@/features/vehicles/Components/ReminderForm', () => ({ ReminderForm: () => null }))
vi.mock('@/features/vehicles/Components/FindingForm', () => ({ FindingForm: () => null }))
vi.mock('@/features/vehicles/Components/VehicleSafetyPanel', () => ({
  VehicleSafetyPanel: () => null,
}))
vi.mock('@/features/vehicles/Components/ArchiveVehicleDialog', () => ({
  ArchiveVehicleDialog: () => null,
}))
vi.mock('@/features/tire-hotel/Components/VehicleTireSets', () => ({ VehicleTireSets: () => null }))
vi.mock('@/features/ai/Components/AskAiSheet', () => ({ AskAiSheet: () => null }))
vi.mock('@/features/inspections/Components/NewInspectionDialog', () => ({
  NewInspectionDialog: () => null,
}))
vi.mock('@/features/quotes/Components/NewQuoteDialog', () => ({ NewQuoteDialog: () => null }))
vi.mock('@/app/(authenticated)/vehicles/[id]/vehicle-activity-feed', () => ({
  VehicleActivityFeed: () => null,
}))
vi.mock('@/app/(authenticated)/vehicles/[id]/notes-table', () => ({ NotesTable: () => null }))
vi.mock('@/app/(authenticated)/vehicles/[id]/findings-table', () => ({ FindingsTable: () => null }))

import { VehicleDetailClient } from '@/app/(authenticated)/vehicles/[id]/vehicle-detail-client'
import { deleteVehicle } from '@/features/vehicles/Actions/deleteVehicle'

// The screen asks its questions through the shared confirm dialog, so every
// render sits inside its provider, as the app's layout does.
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ConfirmProvider })

const VEHICLE = {
  id: 'v1',
  make: 'Volvo',
  model: 'V70',
  year: 2019,
  vin: null,
  licensePlate: 'EL12345',
  color: null,
  mileage: 120000,
  fuelType: null,
  transmission: null,
  engineSize: null,
  engineCode: null,
  hsn: null,
  tsn: null,
  purchaseDate: null,
  purchasePrice: null,
  imageUrl: null,
  isArchived: false,
  archiveReason: null,
  customerId: null,
  customer: null,
  serviceRecords: [],
  reminders: [],
  aiMessages: [],
  _count: { serviceRecords: 0, notes: 0, reminders: 0, findings: 0 },
}

const empty = { records: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
const noBatch = { rows: [], nextCursor: null, total: 0, renderId: 'render-1' }

function renderPage(vehicle = VEHICLE) {
  render(
    <VehicleDetailClient
      vehicle={vehicle}
      paginatedServices={empty}
      noteBatch={noBatch}
      findingBatch={noBatch}
      serviceSearch=""
      serviceRecordType=""
      unitSystem="metric"
      predictionData={null}
    />
  )
}

beforeEach(() => {
  vi.mocked(deleteVehicle).mockReset()
  vi.mocked(deleteVehicle).mockResolvedValue({ success: true })
})

async function askToDelete() {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  renderPage()
  await user.click(screen.getByRole('button', { name: 'Delete from the edit form' }))
  const question = await screen.findByRole('alertdialog', { name: 'Delete vehicle?' })
  return { user, question }
}

describe('deleting a vehicle from its page', () => {
  it('asks in the shared confirmation dialog and names the vehicle and its plate', async () => {
    const { question } = await askToDelete()

    expect(question).toHaveAttribute('data-slot', 'confirm-dialog')
    expect(question).toHaveAttribute('data-tone', 'destructive')
    expect(
      within(question).getByText(
        'This will permanently delete 2019 Volvo V70 and all associated service records, notes, and reminders. This action cannot be undone.'
      )
    ).toBeInTheDocument()
    const row = within(question).getByRole('listitem')
    expect(row).toHaveTextContent('2019 Volvo V70')
    expect(row).toHaveTextContent('EL12345')
    expect(deleteVehicle).not.toHaveBeenCalled()
  })

  it('opens on Cancel, so Enter keeps the vehicle', async () => {
    const { user, question } = await askToDelete()

    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(deleteVehicle).not.toHaveBeenCalled()
  })

  it('deletes the vehicle once Delete is pressed', async () => {
    const { user, question } = await askToDelete()

    await user.click(within(question).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteVehicle).toHaveBeenCalledWith('v1'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
