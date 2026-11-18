/**
 * The header's plate lookup never ends at "found it". A car the workshop has
 * on file can be booked in or given a work order from the answer sheet, and a
 * car added from the sheet comes straight back to it as one of the
 * workshop's, without asking the registry (which may charge) a second time.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = noop

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))
const lookupPlate = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/plateLookupActions', () => ({ lookupPlate }))
const createVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  createVehicle,
  updateVehicle: vi.fn(),
  searchVehicles: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  createCustomer: vi.fn(),
  findOwnerCandidates: vi.fn(async () => ({ success: true, data: [] })),
  getCustomerOption: vi.fn(async () => ({ success: true, data: null })),
  searchCustomers: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/vehicles/Actions/aiAnalyzeVehicleDocument', () => ({
  aiAnalyzeVehicleDocument: vi.fn(),
  isVehicleScanAvailable: vi.fn(async () => ({ success: true, data: false })),
}))
const lookupVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  isVehicleLookupAvailable: vi.fn(async () => ({ success: true, data: { plate: true } })),
  lookupVehicle,
}))
vi.mock('@/features/vehicles/Actions/photoHandoffActions', () => ({
  countPhotosSince: vi.fn(),
  createPhotoHandoffLink: vi.fn(),
  createVehiclePhotoHandoffLink: vi.fn(),
  getVehiclePhotoUrl: vi.fn(),
}))
vi.mock('@/features/inspections/Actions/attachmentActions', () => ({
  countInspectionMedia: vi.fn(),
  createInspectionHandoffLink: vi.fn(),
}))
vi.mock('@/features/invoice-designer/Actions/documentDesignActions', () => ({
  listDesignOptions: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/shortcuts/Actions/saveKeyboardShortcuts', () => ({
  saveKeyboardShortcuts: vi.fn(),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))

import { BOOKING_EVENT, BookingAccessProvider } from '@/components/booking-launcher'
import { PlateLookupProvider, openPlateLookup } from '@/components/plate-lookup-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlateLookupCommand } from '@/features/vehicles/Components/PlateLookupCommand'

const karisCar = {
  id: 'veh-1',
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  licensePlate: 'AB12345',
  vin: null,
  color: null,
  mileage: 0,
  imageUrl: null,
  isArchived: false,
  customer: { id: 'cust-1', name: 'Kari Nordmann', company: null, phone: null },
  inspectionDueAt: null,
  serviceCount: 3,
  lastServiceAt: null,
}

const registryAnswer = {
  make: 'Tesla',
  model: 'Model 3',
  year: 2022,
  licensePlate: 'EL12345',
  source: 'Statens vegvesen',
  connectorId: 'vegvesen',
}

function answer(partial: Record<string, unknown>) {
  return {
    success: true,
    data: {
      plate: 'AB12345',
      vehicle: null,
      registry: null,
      registryError: null,
      source: 'Statens vegvesen',
      ...partial,
    },
  }
}

function renderPalette(access: { canBook?: boolean } = {}) {
  render(
    <PlateLookupProvider
      value={{ available: true, canCreate: true, registryName: 'Statens vegvesen' }}
    >
      <BookingAccessProvider value={{ canBook: access.canBook ?? true, canAddCustomer: true }}>
        <TooltipProvider>
          <PlateLookupCommand />
        </TooltipProvider>
      </BookingAccessProvider>
    </PlateLookupProvider>
  )
}

/** Opens the palette on a plate, the way the header button does. */
async function lookUp(plate: string) {
  act(() => openPlateLookup(plate))
  await waitFor(() => expect(lookupPlate).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('a car the workshop has on file', () => {
  it('books it in, with its owner, from the answer', async () => {
    lookupPlate.mockResolvedValue(answer({ vehicle: karisCar }))
    renderPalette()
    await lookUp('AB12345')
    expect(await screen.findByText('In your workshop')).toBeInTheDocument()

    const booked = vi.fn()
    document.addEventListener(BOOKING_EVENT, booked)
    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }))
    document.removeEventListener(BOOKING_EVENT, booked)

    expect(booked).toHaveBeenCalledTimes(1)
    expect((booked.mock.calls[0][0] as CustomEvent).detail).toEqual({
      vehicle: {
        id: 'veh-1',
        make: 'Volvo',
        model: 'V70',
        year: 2012,
        licensePlate: 'AB12345',
        customerId: 'cust-1',
        customer: { id: 'cust-1', name: 'Kari Nordmann' },
      },
      customer: { id: 'cust-1', name: 'Kari Nordmann', company: null },
    })
    // The palette makes way for the booking.
    await waitFor(() => expect(screen.queryByText('In your workshop')).not.toBeInTheDocument())
  })

  it('opens a new work order for it', async () => {
    lookupPlate.mockResolvedValue(answer({ vehicle: karisCar }))
    renderPalette()
    await lookUp('AB12345')
    fireEvent.click(await screen.findByRole('button', { name: 'New work order' }))
    expect(push).toHaveBeenCalledWith('/vehicles/veh-1/service/new')
  })

  it('still opens the vehicle', async () => {
    lookupPlate.mockResolvedValue(answer({ vehicle: karisCar }))
    renderPalette()
    await lookUp('AB12345')
    fireEvent.click(await screen.findByRole('button', { name: 'Open vehicle' }))
    expect(push).toHaveBeenCalledWith('/vehicles/veh-1')
  })

  it('offers neither for an archived car', async () => {
    lookupPlate.mockResolvedValue(answer({ vehicle: { ...karisCar, isArchived: true } }))
    renderPalette()
    await lookUp('AB12345')
    expect(await screen.findByText('In your workshop, archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open vehicle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book appointment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New work order' })).not.toBeInTheDocument()
  })

  it('offers neither to someone who may not book', async () => {
    lookupPlate.mockResolvedValue(answer({ vehicle: karisCar }))
    renderPalette({ canBook: false })
    await lookUp('AB12345')
    expect(await screen.findByText('In your workshop')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book appointment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New work order' })).not.toBeInTheDocument()
  })
})

describe('a car added from the answer', () => {
  it('comes back as one of the workshop cars, without asking the registry again', async () => {
    lookupPlate.mockResolvedValue(answer({ plate: 'EL12345', registry: registryAnswer }))
    createVehicle.mockResolvedValue({
      success: true,
      data: {
        id: 'veh-9',
        make: 'Tesla',
        model: 'Model 3',
        year: 2022,
        licensePlate: 'EL12345',
        customerId: null,
      },
    })
    renderPalette()
    await lookUp('EL12345')
    expect(await screen.findByText('Not in your workshop yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }))

    // The full form, filled in with what the registry said.
    const form = await screen.findByRole('dialog', { name: 'Add New Vehicle' })
    await waitFor(() => expect(within(form).getByLabelText('Make *')).toHaveValue('Tesla'))
    expect(within(form).getByLabelText('Model *')).toHaveValue('Model 3')
    expect(within(form).getByLabelText('License Plate')).toHaveValue('EL12345')
    fireEvent.click(within(form).getByRole('button', { name: 'Add New Vehicle' }))

    expect(await screen.findByText('In your workshop')).toBeInTheDocument()
    expect(screen.getByText('2022 Tesla Model 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book appointment' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New work order' }))
    expect(push).toHaveBeenCalledWith('/vehicles/veh-9/service/new')

    expect(lookupPlate).toHaveBeenCalledTimes(1)
    expect(lookupVehicle).not.toHaveBeenCalled()
  })
})
