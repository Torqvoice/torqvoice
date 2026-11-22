/**
 * The new work order picker speaks the workshop's language.
 *
 * A marine workshop picks a vessel, adds a vessel, and gives it a registration
 * number rather than a licence plate. An automotive workshop's wording has to
 * stay exactly as it was, because the end-to-end specs find the dialog and its
 * buttons by those words.
 *
 * A vehicle not on file is added in the full vehicle form, the same one the
 * vehicles page opens, and its work order opens as soon as it is saved.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { PlateLookupProvider } from '@/components/plate-lookup-context'
import { TooltipProvider } from '@/components/ui/tooltip'

// Radix measures and captures pointers; jsdom does neither.
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
const searchVehicles = vi.hoisted(() => vi.fn())
const createVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  createVehicle,
  searchVehicles,
  updateVehicle: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/createDraftServiceRecord', () => ({
  createDraftCounterSale: vi.fn(),
}))
const searchCustomers = vi.hoisted(() => vi.fn())
vi.mock('@/features/customers/Actions/customerActions', () => ({
  createCustomer: vi.fn(),
  findOwnerCandidates: vi.fn(async () => ({ success: true, data: [] })),
  getCustomerOption: vi.fn(async () => ({ success: true, data: null })),
  searchCustomers,
}))
vi.mock('@/features/vehicles/Actions/aiAnalyzeVehicleDocument', () => ({
  aiAnalyzeVehicleDocument: vi.fn(),
  getVehicleScanAvailability: vi.fn(async () => ({ success: true, data: false })),
}))
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  getVehicleLookupAvailability: vi.fn(async () => ({ success: true, data: {} })),
  lookupVehicle: vi.fn(),
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
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/upgrade-gate', () => ({ handleGated: () => false }))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))

const { VehiclePickerDialog } = await import('@/components/vehicle-picker-dialog')

const unregistered = {
  id: 'v1',
  make: 'Yamaha',
  model: 'F150',
  year: 2020,
  licensePlate: null,
  customer: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  searchCustomers.mockResolvedValue({
    success: true,
    data: [{ id: 'c1', name: 'Ann Berg', company: null }],
  })
})

function renderPicker(
  serviceType: string,
  props: {
    title?: string
    empty?: boolean
    canCreate?: boolean
    redirectQuery?: Record<string, string>
  } = {}
) {
  searchVehicles.mockReset()
  searchVehicles.mockResolvedValue({
    success: true,
    data: props.empty ? [] : [unregistered],
  })
  return render(
    <ServiceTypeProvider serviceType={serviceType}>
      <PlateLookupProvider
        value={{ available: false, canCreate: props.canCreate ?? true, registryName: null }}
      >
        <TooltipProvider>
          <VehiclePickerDialog
            open
            onOpenChange={vi.fn()}
            title={props.title}
            redirectQuery={props.redirectQuery}
          />
        </TooltipProvider>
      </PlateLookupProvider>
    </ServiceTypeProvider>
  )
}

/** Fills what a vehicle must have and saves the form. */
function saveNewVehicle(make: string, model: string, year: string, submit = 'Add New Vehicle') {
  fireEvent.change(screen.getByLabelText(/^(Make|Manufacturer) \*$/), { target: { value: make } })
  fireEvent.change(screen.getByLabelText('Model *'), { target: { value: model } })
  fireEvent.change(screen.getByLabelText('Year *'), { target: { value: year } })
  fireEvent.click(screen.getByRole('button', { name: submit }))
}

describe('VehiclePickerDialog, automotive', () => {
  it('keeps its vehicle wording on the select step', async () => {
    renderPicker('automotive')
    expect(screen.getByRole('dialog', { name: 'Select Vehicle for Work Order' })).toBeVisible()
    expect(screen.getByPlaceholderText('Search vehicles...')).toBeInTheDocument()
    expect(await screen.findByText('No plate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add New Vehicle' })).toBeInTheDocument()
  })

  it("uses the caller's title", () => {
    renderPicker('automotive', { title: 'Select Vehicle' })
    expect(screen.getByRole('dialog', { name: 'Select Vehicle' })).toBeVisible()
  })

  it('says no vehicles were found when there are none', async () => {
    renderPicker('automotive', { empty: true })
    expect(await screen.findByText('No vehicles found.')).toBeInTheDocument()
  })

  it('asks the server for the recent vehicles, then for what was typed', async () => {
    renderPicker('automotive')
    await waitFor(() => expect(searchVehicles).toHaveBeenCalledWith(undefined, 30))
    fireEvent.change(screen.getByPlaceholderText('Search vehicles...'), {
      target: { value: ' smith ' },
    })
    await waitFor(() => expect(searchVehicles).toHaveBeenCalledWith('smith', 30))
  })

  it('opens the work order of a vehicle picked from the list, with the redirect query', async () => {
    renderPicker('automotive', { redirectQuery: { date: '2026-11-16' } })
    fireEvent.click(await screen.findByText('2020 Yamaha F150'))
    expect(push).toHaveBeenCalledWith('/vehicles/v1/service/new?date=2026-11-16')
  })

  it('opens the full vehicle form to add a vehicle, not a short one', async () => {
    renderPicker('automotive')
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    const form = await screen.findByRole('dialog', { name: 'Add New Vehicle' })
    expect(form).toBeVisible()
    expect(screen.getByLabelText('Make *')).toHaveAttribute('placeholder', 'Toyota')
    expect(screen.getByLabelText('License Plate')).toBeInTheDocument()
    // The whole form: the owner, the fuel, the VIN.
    expect(screen.getByRole('radiogroup', { name: 'Fuel Type' })).toBeInTheDocument()
    expect(screen.getByLabelText('VIN')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create & Continue' })).not.toBeInTheDocument()
  })

  it('opens the new work order once the vehicle is saved, with the redirect query', async () => {
    createVehicle.mockResolvedValue({
      success: true,
      data: {
        id: 'v9',
        make: 'Volvo',
        model: 'V70',
        year: 2015,
        licensePlate: null,
        customerId: null,
      },
    })
    renderPicker('automotive', { redirectQuery: { date: '2026-11-16', time: '09:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    await screen.findByRole('dialog', { name: 'Add New Vehicle' })
    saveNewVehicle('Volvo', 'V70', '2015')

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/vehicles/v9/service/new?date=2026-11-16&time=09%3A30')
    )
    expect(createVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ make: 'Volvo', model: 'V70', year: 2015 })
    )
  })

  it('starts the new vehicle with the plate that was searched for', async () => {
    renderPicker('automotive', { empty: true })
    fireEvent.change(screen.getByPlaceholderText('Search vehicles...'), {
      target: { value: 'ab 12345' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    await screen.findByRole('dialog', { name: 'Add New Vehicle' })
    await waitFor(() => expect(screen.getByLabelText('License Plate')).toHaveValue('AB 12345'))
    expect(screen.getByLabelText('License Plate')).toHaveFocus()
  })

  it('leaves the plate empty when the search was for a name', async () => {
    renderPicker('automotive', { empty: true })
    fireEvent.change(screen.getByPlaceholderText('Search vehicles...'), {
      target: { value: 'smith' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    await screen.findByRole('dialog', { name: 'Add New Vehicle' })
    await waitFor(() => expect(screen.getByLabelText('License Plate')).toHaveFocus())
    expect(screen.getByLabelText('License Plate')).toHaveValue('')
  })

  it('offers no new vehicle to someone who may not add one', async () => {
    renderPicker('automotive', { canCreate: false })
    expect(await screen.findByText('No plate')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add New Vehicle' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parts-Only Sale' })).toBeInTheDocument()
  })

  it('keeps the customer chosen for a parts sale after going back and forth', async () => {
    renderPicker('automotive')
    fireEvent.click(screen.getByRole('button', { name: 'Parts-Only Sale' }))
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: /Ann Berg/ }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Ann Berg')

    fireEvent.click(screen.getAllByRole('button')[0]) // back
    fireEvent.click(screen.getByRole('button', { name: 'Parts-Only Sale' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Ann Berg')
    expect(screen.getByRole('button', { name: 'Create Sale' })).toBeEnabled()
  })
})

describe('VehiclePickerDialog, marine', () => {
  it('asks for a vessel on the select step, whatever title the caller passed', async () => {
    renderPicker('marine', { title: 'Select Vehicle' })
    expect(screen.getByRole('dialog', { name: 'Select Vessel for Work Order' })).toBeVisible()
    expect(screen.getByPlaceholderText('Search vessels...')).toBeInTheDocument()
    expect(await screen.findByText('No registration')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add New Vessel' })).toBeInTheDocument()
    expect(screen.queryByText(/vehicle/i)).toBeNull()
  })

  it('says no vessels were found when there are none', async () => {
    renderPicker('marine', { empty: true })
    expect(await screen.findByText('No vessels found.')).toBeInTheDocument()
  })

  it('asks for what a boat has in the full form', async () => {
    renderPicker('marine')
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vessel' }))
    expect(await screen.findByRole('dialog', { name: 'Add New Vessel' })).toBeVisible()
    expect(screen.getByLabelText('Manufacturer *')).toHaveAttribute('placeholder', 'Boston Whaler')
    expect(screen.getByLabelText('Registration Number')).toBeInTheDocument()
    expect(screen.queryByText('License Plate')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add New Vessel' })).toBeInTheDocument()
  })

  it('opens the new work order once the vessel is saved', async () => {
    createVehicle.mockResolvedValue({
      success: true,
      data: {
        id: 'b1',
        make: 'Boston Whaler',
        model: 'Montauk 170',
        year: 2019,
        licensePlate: 'LK 1234',
        customerId: null,
      },
    })
    renderPicker('marine')
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vessel' }))
    await screen.findByRole('dialog', { name: 'Add New Vessel' })
    saveNewVehicle('Boston Whaler', 'Montauk 170', '2019', 'Add New Vessel')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vehicles/b1/service/new'))
  })

  it('offers a parts sale without a vessel', () => {
    renderPicker('marine')
    fireEvent.click(screen.getByRole('button', { name: 'Parts-Only Sale' }))
    expect(
      screen.getByText('Create an invoice without a vessel, for over-the-counter parts sales.')
    ).toBeInTheDocument()
  })
})
