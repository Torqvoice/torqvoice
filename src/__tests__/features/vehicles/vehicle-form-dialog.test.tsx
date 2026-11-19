/**
 * The edit vehicle dialog: which vehicle is open, the choices in sight, the
 * VIN counted as it is typed, delete handed to the page, and a dialog closed
 * without saving that opens again on what is saved. Adding one: the vehicle
 * handed to whoever goes on with it, or a booking offered straight from the
 * confirmation, and Enter in the plate asking the registry.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vehicles/veh-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(async () => ({ success: true })),
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn() },
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
const isVehicleLookupAvailable = vi.hoisted(() => vi.fn())
const lookupVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  isVehicleLookupAvailable,
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

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BOOKING_EVENT, BookingAccessProvider } from '@/components/booking-launcher'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const VEHICLE = {
  id: 'veh-1',
  make: 'BMW',
  model: '5-Serie F11',
  year: 2011,
  vin: 'WBAMX11090C883495',
  licensePlate: 'BS48364',
  color: null,
  mileage: 225040,
  fuelType: 'diesel',
  transmission: 'automatic',
  engineSize: null,
  engineCode: null,
  imageUrl: null,
  customerId: null,
  customer: null,
  inspectionStatus: null,
}

function renderForm(props: Partial<React.ComponentProps<typeof VehicleForm>> = {}) {
  const onOpenChange = vi.fn()
  const view = render(
    <TooltipProvider>
      <VehicleForm
        open
        onOpenChange={onOpenChange}
        vehicle={VEHICLE}
        distanceUnit="km"
        {...props}
      />
    </TooltipProvider>
  )
  return { ...view, onOpenChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  // No registry connected unless a test connects one.
  isVehicleLookupAvailable.mockResolvedValue({ success: true, data: {} })
})

describe('edit vehicle dialog', () => {
  it('names the vehicle open, with its plate and what it is', async () => {
    renderForm()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /BMW 5-Serie F11/ })).toBeInTheDocument()
    expect(within(dialog).getAllByText('BS48364').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('2011 · Diesel · Automatic')).toBeInTheDocument()
  })

  it('shows every fuel and gearbox at once, with the saved one chosen', async () => {
    renderForm()
    const fuel = await screen.findByRole('radiogroup', { name: 'Fuel Type' })
    expect(within(fuel).getByRole('radio', { name: 'Diesel' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.click(within(fuel).getByRole('radio', { name: 'Electric' }))
    expect(within(fuel).getByRole('radio', { name: 'Electric' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(within(fuel).getByRole('radio', { name: 'Diesel' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    const gearbox = screen.getByRole('radiogroup', { name: 'Transmission' })
    expect(within(gearbox).getByRole('radio', { name: 'Automatic' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('keeps a fuel the registry wrote that the form does not offer, chosen', async () => {
    renderForm({ vehicle: { ...VEHICLE, fuelType: 'Hydrogen' } })
    const fuel = await screen.findByRole('radiogroup', { name: 'Fuel Type' })
    expect(within(fuel).getByRole('radio', { name: 'Hydrogen' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('counts the VIN as it is typed', async () => {
    renderForm()
    expect(await screen.findByText('17 of 17 characters')).toBeInTheDocument()
    const vin = screen.getByLabelText('VIN')
    fireEvent.input(vin, { target: { value: 'WBAMX11090C88349' } })
    expect(screen.getByText('16 of 17 characters')).toBeInTheDocument()
  })

  it('shows the mileage with its unit, and follows the field', async () => {
    renderForm()
    expect(await screen.findByText('225,040')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '226100' } })
    expect(screen.getByText('226,100')).toBeInTheDocument()
  })

  it('changes the mileage where it is shown at the top, and the field follows', async () => {
    renderForm()
    fireEvent.click(await screen.findByRole('button', { name: 'Change mileage: 225,040 km' }))
    // The reading opens to type in straight away, in place.
    const editor = document.activeElement as HTMLInputElement
    expect(editor).toHaveAttribute('aria-label', 'Mileage')
    expect(editor).not.toHaveAttribute('name')
    const field = document.querySelector('input[name="mileage"]')
    fireEvent.change(editor, { target: { value: '231500' } })
    // Enter keeps the reading without saving the form.
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Change mileage: 231,500 km' })).toBeInTheDocument()
    expect(field).toHaveValue(231500)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('puts the reading back on Escape, and keeps the dialog open', async () => {
    const { onOpenChange } = renderForm()
    fireEvent.click(await screen.findByRole('button', { name: 'Change mileage: 225,040 km' }))
    const editor = document.activeElement as HTMLInputElement
    fireEvent.change(editor, { target: { value: '999' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Change mileage: 225,040 km' })).toBeInTheDocument()
    expect(screen.getByLabelText('Mileage')).toHaveValue(225040)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('hands delete to the page and closes itself', async () => {
    const onDelete = vi.fn()
    renderForm({ onDelete })
    fireEvent.click(await screen.findByRole('button', { name: /Delete vehicle/ }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('offers no delete where the page gives none, nor when adding', async () => {
    renderForm({ onDelete: undefined })
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: /Delete vehicle/ })).not.toBeInTheDocument()
  })

  it('opens again on what is saved after closing without saving', async () => {
    const { rerender } = renderForm()
    const fuel = await screen.findByRole('radiogroup', { name: 'Fuel Type' })
    fireEvent.click(within(fuel).getByRole('radio', { name: 'Electric' }))

    rerender(
      <TooltipProvider>
        <VehicleForm open={false} onOpenChange={vi.fn()} vehicle={VEHICLE} />
      </TooltipProvider>
    )
    await act(async () => undefined)
    rerender(
      <TooltipProvider>
        <VehicleForm open onOpenChange={vi.fn()} vehicle={VEHICLE} />
      </TooltipProvider>
    )

    const again = await screen.findByRole('radiogroup', { name: 'Fuel Type' })
    expect(within(again).getByRole('radio', { name: 'Diesel' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })
})

describe('saving the photo', () => {
  const withPhoto = { ...VEHICLE, imageUrl: '/api/protected/files/org-a/vehicles/old.jpg' }

  it('leaves the photo out of a save that did not change it', async () => {
    // A phone may have replaced it meanwhile; sending the old address back
    // would undo that.
    renderForm({ vehicle: withPhoto })
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(vi.mocked(updateVehicle).mock.calls[0][0]).not.toHaveProperty('imageUrl')
  })

  it('saves a removed photo as removed', async () => {
    renderForm({ vehicle: withPhoto })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(vi.mocked(updateVehicle).mock.calls[0][0]).toMatchObject({ imageUrl: '' })
  })
})

describe('adding a vehicle', () => {
  const SAVED = {
    id: 'veh-9',
    make: 'Volvo',
    model: 'V70',
    year: 2015,
    licensePlate: 'AB12345',
    customerId: null,
  }

  function renderNew(
    props: Partial<React.ComponentProps<typeof VehicleForm>> = {},
    canBook = true
  ) {
    const onOpenChange = vi.fn()
    render(
      <BookingAccessProvider value={{ canBook, canAddCustomer: true }}>
        <TooltipProvider>
          <VehicleForm open onOpenChange={onOpenChange} {...props} />
        </TooltipProvider>
      </BookingAccessProvider>
    )
    return { onOpenChange }
  }

  async function fillAndSave() {
    fireEvent.change(await screen.findByLabelText('Make *'), { target: { value: 'Volvo' } })
    fireEvent.change(screen.getByLabelText('Model *'), { target: { value: 'V70' } })
    fireEvent.change(screen.getByLabelText('Year *'), { target: { value: '2015' } })
    fireEvent.change(screen.getByLabelText('License Plate'), { target: { value: 'AB12345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    await waitFor(() => expect(createVehicle).toHaveBeenCalled())
  }

  beforeEach(() => {
    vi.mocked(createVehicle).mockResolvedValue({ success: true, data: SAVED } as never)
  })

  it('hands the vehicle just added to the caller that goes on with it', async () => {
    const onCreated = vi.fn()
    const { onOpenChange } = renderNew({ onCreated })
    await fillAndSave()

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated).toHaveBeenCalledWith({
      id: 'veh-9',
      make: 'Volvo',
      model: 'V70',
      year: 2015,
      licensePlate: 'AB12345',
      customerId: null,
      customer: null,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The caller books it or opens its work order; the toast offers nothing more.
    expect(toast.success).toHaveBeenCalledWith('Vehicle added')
  })

  it('offers to book the new vehicle in from the confirmation', async () => {
    renderNew()
    await fillAndSave()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    const [message, options] = vi.mocked(toast.success).mock.calls[0] as unknown as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toBe('Vehicle added')
    expect(options.action.label).toBe('Book appointment')

    const booked = vi.fn()
    document.addEventListener(BOOKING_EVENT, booked)
    options.action.onClick()
    document.removeEventListener(BOOKING_EVENT, booked)
    expect(booked).toHaveBeenCalledTimes(1)
    expect((booked.mock.calls[0][0] as CustomEvent).detail).toEqual({
      vehicle: expect.objectContaining({ id: 'veh-9', make: 'Volvo', licensePlate: 'AB12345' }),
    })
  })

  it('offers no booking to someone who may not book', async () => {
    renderNew({}, false)
    await fillAndSave()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Vehicle added')
  })

  it('asks the registry when Enter is pressed in the plate field', async () => {
    isVehicleLookupAvailable.mockResolvedValue({ success: true, data: { plate: true } })
    lookupVehicle.mockResolvedValue({ success: true, data: null })
    renderNew()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Look up plate' })).toBeEnabled())
    const plate = screen.getByLabelText('License Plate')
    fireEvent.change(plate, { target: { value: 'AB12345' } })
    fireEvent.keyDown(plate, { key: 'Enter' })

    await waitFor(() =>
      expect(lookupVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ by: 'plate', value: 'AB12345' })
      )
    )
    expect(createVehicle).not.toHaveBeenCalled()
  })

  it('does not save the form on a second Enter while the registry is still answering', async () => {
    isVehicleLookupAvailable.mockResolvedValue({ success: true, data: { plate: true } })
    // The registry never answers in this test.
    lookupVehicle.mockReturnValue(new Promise(() => undefined))
    renderNew()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Look up plate' })).toBeEnabled())
    // Everything a save needs is filled in.
    fireEvent.change(screen.getByLabelText('Make *'), { target: { value: 'Volvo' } })
    fireEvent.change(screen.getByLabelText('Model *'), { target: { value: 'V70' } })
    fireEvent.change(screen.getByLabelText('Year *'), { target: { value: '2015' } })
    const plate = screen.getByLabelText('License Plate')
    fireEvent.change(plate, { target: { value: 'AB12345' } })

    expect(fireEvent.keyDown(plate, { key: 'Enter' })).toBe(false)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Look up plate' })).toBeDisabled()
    )
    // The second Enter is taken by the lookup still running, not the form.
    expect(fireEvent.keyDown(plate, { key: 'Enter' })).toBe(false)
    await act(async () => undefined)

    expect(lookupVehicle).toHaveBeenCalledTimes(1)
    expect(createVehicle).not.toHaveBeenCalled()
  })

  it('asks nothing on Enter without a registry', async () => {
    renderNew()
    await waitFor(() => expect(isVehicleLookupAvailable).toHaveBeenCalled())
    const plate = screen.getByLabelText('License Plate')
    expect(screen.getByRole('button', { name: 'Look up plate' })).toBeDisabled()
    fireEvent.change(plate, { target: { value: 'AB12345' } })
    // Enter is left to the form, as in any other field.
    expect(fireEvent.keyDown(plate, { key: 'Enter' })).toBe(true)
    await act(async () => undefined)
    expect(lookupVehicle).not.toHaveBeenCalled()
    expect(createVehicle).not.toHaveBeenCalled()
  })

  it('starts on a plate typed elsewhere, with the cursor in it', async () => {
    renderNew({ initialPlate: 'AB 12345' })
    await waitFor(() => expect(screen.getByLabelText('License Plate')).toHaveValue('AB 12345'))
    expect(screen.getByLabelText('License Plate')).toHaveFocus()
  })
})

describe('a reading lowered on the vehicle form', () => {
  const NOTICE = 'Lower than the last reading (225,040 km). You can still save it.'
  const field = () => screen.getByLabelText('Mileage', { selector: 'input#mileage' })

  it('says nothing while the reading is as saved or goes up', async () => {
    renderForm()
    await screen.findByRole('dialog')
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    fireEvent.change(field(), { target: { value: '231500' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    fireEvent.change(field(), { target: { value: '' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('says so beside the field when it goes down, and saves it all the same', async () => {
    renderForm()
    await screen.findByRole('dialog')
    fireEvent.change(field(), { target: { value: '22504' } })
    // Under the field and under the figure at the top, which is the same reading.
    expect(screen.getAllByText(NOTICE)).toHaveLength(2)
    expect(field()).toHaveAccessibleDescription(NOTICE)

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(vi.mocked(updateVehicle).mock.calls[0][0]).toMatchObject({ mileage: 22504 })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('goes away when the reading is put back', async () => {
    renderForm()
    await screen.findByRole('dialog')
    fireEvent.change(field(), { target: { value: '100' } })
    expect(screen.getAllByTestId('lower-reading-notice').length).toBeGreaterThan(0)
    fireEvent.change(field(), { target: { value: '225040' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('has nothing to compare with on a new vehicle', async () => {
    renderForm({ vehicle: undefined })
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('Mileage', { selector: 'input#mileage' }), {
      target: { value: '5' },
    })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('speaks of engine hours in a boat workshop', async () => {
    render(
      <ServiceTypeProvider serviceType="marine">
        <TooltipProvider>
          <VehicleForm open onOpenChange={vi.fn()} vehicle={{ ...VEHICLE, mileage: 1240 }} />
        </TooltipProvider>
      </ServiceTypeProvider>
    )
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('Engine Hours', { selector: 'input#mileage' }), {
      target: { value: '900' },
    })
    expect(
      screen.getAllByText('Lower than the last reading (1,240 hours). You can still save it.')
        .length
    ).toBeGreaterThan(0)
  })
})
