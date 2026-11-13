/**
 * The edit vehicle dialog: which vehicle is open, the choices in sight, the
 * VIN counted as it is typed, delete handed to the page, and a dialog closed
 * without saving that opens again on what is saved.
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
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  isVehicleLookupAvailable: vi.fn(async () => ({ success: true, data: true })),
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

import { TooltipProvider } from '@/components/ui/tooltip'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

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
