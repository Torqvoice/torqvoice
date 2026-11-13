/**
 * The vehicle page when an action does not reach the server.
 *
 * Dismissing the predicted maintenance awaited the action inside a
 * transition, so a dropped connection went to the error boundary and the
 * whole vehicle page was replaced by the error page.
 *
 * Making a work order from observations deleted the observations after the
 * work order was made and never read the answers: one the server kept stayed
 * open on the vehicle with nothing said, and a work order that could not be
 * made on a dropped connection left the button busy.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlassModal, useGlassModal } from '@/components/glass-modal'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const dismissMaintenance = vi.fn()
const createServiceRecord = vi.fn()
const deleteFinding = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams('tab=findings'),
  usePathname: () => '/vehicles/v1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/vehicles/Actions/dismissMaintenance', () => ({
  dismissMaintenance: (id: string) => dismissMaintenance(id),
  undismissMaintenance: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  createServiceRecord: (input: unknown) => createServiceRecord(input),
}))
vi.mock('@/features/vehicles/Actions/findingActions', () => ({
  deleteFinding: (id: string) => deleteFinding(id),
}))
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
// Screens and dialogs of their own; the findings list is reduced to the one
// button that asks for a work order from the open observations.
vi.mock('@/features/vehicles/Components/VehicleForm', () => ({ VehicleForm: () => null }))
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
vi.mock('@/app/(authenticated)/vehicles/[id]/findings-table', () => ({
  FindingsTable: ({
    onCreateWorkOrder,
    isCreatingWorkOrder,
  }: {
    onCreateWorkOrder: (ids: string[]) => void
    isCreatingWorkOrder: boolean
  }) => (
    <button
      type="button"
      disabled={isCreatingWorkOrder}
      onClick={() => onCreateWorkOrder(['f1', 'f2'])}
    >
      Create Work Order (2)
    </button>
  ),
}))

import { VehicleDetailClient } from '@/app/(authenticated)/vehicles/[id]/vehicle-detail-client'

/** Stands in for the app's error page, so losing the page is visible. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something went wrong</p> : this.props.children
  }
}

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
  _count: { serviceRecords: 0, notes: 0, reminders: 0, findings: 2 },
}

const finding = (id: string, description: string) => ({
  id,
  description,
  severity: 'needs_work',
  status: 'open',
  notes: null,
  imageUrls: [],
  createdAt: new Date('2026-11-01T09:00:00Z'),
  serviceRecord: null,
  resolvedServiceRecord: null,
})

const empty = { records: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }

function renderPage() {
  render(
    <ErrorPage>
      <VehicleDetailClient
        vehicle={VEHICLE}
        paginatedServices={empty}
        paginatedNotes={empty}
        paginatedFindings={{
          records: [finding('f1', 'Front pads worn'), finding('f2', 'Wiper blades torn')],
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }}
        serviceSearch=""
        serviceRecordType=""
        unitSystem="metric"
        predictionData={{
          predictedMileage: 131000,
          avgPerDay: 40,
          lastServiceMileage: 105000,
          serviceInterval: 15000,
          mileageSinceLastService: 15000,
          status: 'overdue',
          maintenanceDismissed: false,
          confidencePercent: 80,
        }}
      />
      <GlassModal />
    </ErrorPage>
  )
}

describe('vehicle page on a dropped connection', () => {
  beforeEach(() => {
    dismissMaintenance.mockReset()
    createServiceRecord.mockReset()
    deleteFinding.mockReset()
    router.push.mockClear()
    vi.mocked(toast.error).mockClear()
    act(() => useGlassModal.getState().close())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('says dismissing the predicted maintenance failed and keeps the page', async () => {
    dismissMaintenance.mockImplementation(offline)
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the change. Try again.")
    )
    expect(dismissMaintenance).toHaveBeenCalledWith('v1')
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
  })

  it('opens the new work order and says the observations it took are still open', async () => {
    createServiceRecord.mockResolvedValue({ success: true, data: { id: 'job1' } })
    deleteFinding.mockImplementation(async (id: string) =>
      id === 'f1' ? { success: true, data: { findingId: id } } : offline()
    )
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Work Order (2)' }))
    })

    expect(deleteFinding).toHaveBeenCalledWith('f1')
    expect(deleteFinding).toHaveBeenCalledWith('f2')
    expect(toast.error).toHaveBeenCalledWith(
      'The work order was created, but the observations could not be removed from the vehicle.'
    )
    expect(router.push).toHaveBeenCalledWith('/vehicles/v1/service/job1')
  })

  it('opens the new work order without a word when every observation was removed', async () => {
    createServiceRecord.mockResolvedValue({ success: true, data: { id: 'job1' } })
    deleteFinding.mockImplementation(async (id: string) => ({
      success: true,
      data: { findingId: id },
    }))
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Work Order (2)' }))
    })

    expect(router.push).toHaveBeenCalledWith('/vehicles/v1/service/job1')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('says the work order could not be made and leaves the button usable', async () => {
    createServiceRecord.mockImplementation(offline)
    renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Work Order (2)' }))
    })

    expect(
      await screen.findByText("Couldn't create the work order. Try again.")
    ).toBeInTheDocument()
    expect(deleteFinding).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Create Work Order (2)', hidden: true })
    ).toBeEnabled()
  })
})
