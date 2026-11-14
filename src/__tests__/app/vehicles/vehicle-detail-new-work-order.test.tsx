/**
 * Starting work from the vehicle page: a work order is one click, and the
 * other things to add (quote, inspection, note, observation, reminder) wait
 * behind the arrow beside it. Over the notes, observations or reminders the
 * same button adds one of those, so there is one place to add from and never
 * a second button under it. An archived vehicle offers neither.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/app/(authenticated)/vehicles/[id]/findings-table', () => ({ FindingsTable: () => null }))

import { VehicleDetailClient } from '@/app/(authenticated)/vehicles/[id]/vehicle-detail-client'

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

function renderPage(vehicle = VEHICLE) {
  render(
    <VehicleDetailClient
      vehicle={vehicle}
      paginatedServices={empty}
      paginatedNotes={empty}
      paginatedFindings={empty}
      serviceSearch=""
      serviceRecordType=""
      unitSystem="metric"
      predictionData={null}
    />
  )
}

afterEach(() => {
  url.query = ''
})

describe('starting work from the vehicle page', () => {
  it('opens a new work order for this vehicle in one click', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'New Work Order' })).toHaveAttribute(
      'href',
      '/vehicles/v1/service/new'
    )
  })

  it('keeps everything else to add behind the arrow beside it', async () => {
    renderPage()
    fireEvent.keyDown(screen.getByRole('button', { name: 'More to add' }), { key: 'Enter' })

    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Add Quote',
      'Add Inspection',
      'Add Note',
      'Add Observation',
      'Add Reminder',
    ])
  })

  it.each([
    ['all', 'New Work Order'],
    ['services', 'New Work Order'],
    ['quotes', 'Add Quote'],
    ['inspections', 'Add Inspection'],
    ['notes', 'Add Note'],
    ['findings', 'Add Observation'],
    ['reminders', 'Add Reminder'],
  ])('offers to add what the %s list holds: %s', (tab, label) => {
    url.query = tab === 'all' ? '' : `tab=${tab}`
    renderPage()
    // The button beside the arrow, whether it is a link or opens a dialog.
    const group = screen.getByRole('button', { name: 'More to add' }).parentElement as HTMLElement
    expect(group.firstElementChild).toHaveTextContent(label)
  })

  it.each([
    ['quotes', 'Add Quote'],
    ['inspections', 'Add Inspection'],
    ['notes', 'Add Note'],
    ['findings', 'Add Observation'],
    ['reminders', 'Add Reminder'],
  ])('adds to the %s list from the same button, and only from it', async (tab, label) => {
    url.query = `tab=${tab}`
    renderPage()

    // One button for it, where the work order button is on the other lists.
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'New Work Order' })).not.toBeInTheDocument()

    // The work order moves behind the arrow, and what the button already
    // does is not offered there a second time.
    fireEvent.keyDown(screen.getByRole('button', { name: 'More to add' }), { key: 'Enter' })
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    expect(items).toContain('New Work Order')
    expect(items).not.toContain(label)
  })

  it('offers neither on an archived vehicle', () => {
    renderPage({ ...VEHICLE, isArchived: true, archiveReason: null })
    expect(screen.queryByRole('link', { name: 'New Work Order' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More to add' })).not.toBeInTheDocument()
  })
})
