/**
 * The Details list on the vehicle page: every line opens the edit form on its
 * own box, and a workshop that uses the fleet number sees its line on every
 * vehicle, with "Add" while it is empty.
 */
import type { ReactElement } from 'react'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { FleetNumberProvider } from '@/components/fleet-number-context'
import { fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
// The edit form, reduced to whether it is open and which box it opens on.
vi.mock('@/features/vehicles/Components/VehicleForm', () => ({
  VehicleForm: ({ open, focusField }: { open: boolean; focusField?: string | null }) =>
    open ? <div data-testid="edit-form" data-focus={focusField ?? ''} /> : null,
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

// The screen asks its questions through the shared confirm dialog, so every
// render sits inside its provider, as the app's layout does.
const render = (ui: ReactElement, fleetNumber: boolean) =>
  renderBare(<FleetNumberProvider enabled={fleetNumber}>{ui}</FleetNumberProvider>, {
    wrapper: ConfirmProvider,
  })

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

function renderPage(vehicle: object = {}, fleetNumber = true) {
  render(
    <VehicleDetailClient
      vehicle={{ ...VEHICLE, ...vehicle } as typeof VEHICLE}
      paginatedServices={empty}
      paginatedNotes={empty}
      paginatedFindings={empty}
      serviceSearch=""
      serviceRecordType=""
      unitSystem="metric"
      predictionData={null}
    />,
    fleetNumber
  )
}

/** The line of the Details list with this label. */
const line = (label: string) => within(screen.getByText(label).parentElement as HTMLElement)

describe('editing a vehicle from its details', () => {
  it('offers to add the fleet number while the vehicle has none', () => {
    renderPage({ fleetNumber: null })
    fireEvent.click(line('Fleet no.').getByRole('button', { name: 'Add' }))

    expect(screen.getByTestId('edit-form')).toHaveAttribute('data-focus', 'fleetNumber')
  })

  it('shows no fleet number line to a workshop that does not use it', () => {
    renderPage({ fleetNumber: null, color: 'Red' }, false)
    expect(screen.queryByText('Fleet no.')).not.toBeInTheDocument()
  })

  it('opens the edit form on the detail that was clicked', () => {
    renderPage({ fleetNumber: 'T-208', color: 'Red' })

    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByTestId('edit-form')).toHaveAttribute('data-focus', 'color')
  })

  it('opens it from the label too', () => {
    renderPage({ fleetNumber: 'T-208' })

    fireEvent.click(screen.getByText('Fleet no.'))
    expect(screen.getByTestId('edit-form')).toHaveAttribute('data-focus', 'fleetNumber')
  })

  it('copies a number without opening the edit form', () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    renderPage({ fleetNumber: 'T-208' })

    fireEvent.click(line('Fleet no.').getByRole('button', { name: /copy/i }))
    expect(screen.queryByTestId('edit-form')).not.toBeInTheDocument()
  })

  it('leaves an archived vehicle to be read only', () => {
    renderPage({ fleetNumber: null, color: 'Red', isArchived: true })
    expect(screen.queryByText('Fleet no.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Red' })).not.toBeInTheDocument()
    expect(screen.getByText('Red')).toBeInTheDocument()
  })
})
