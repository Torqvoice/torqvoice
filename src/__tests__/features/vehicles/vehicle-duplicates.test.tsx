/**
 * The vehicle form says when another vehicle of the workshop already has
 * the plate being typed, names it and its owner with a link, and lets the
 * person save anyway. A VIN that is not seventeen letters and digits is
 * said under the field, never refused, and not at all in a boat workshop,
 * where the field holds a hull number.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vehicles',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/findVehiclesWithPlate', () => ({
  findVehiclesWithPlate: vi.fn(),
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

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { findVehiclesWithPlate } from '@/features/vehicles/Actions/findVehiclesWithPlate'

const OTHER = {
  id: 'veh-other',
  year: 2011,
  make: 'BMW',
  model: '520d',
  licensePlate: 'ZZ 10001',
  customer: { id: 'cust-kari', name: 'ZZ Kari Testvik' },
}

const SAVED = {
  id: 'veh-1',
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  vin: null,
  licensePlate: 'ZZ 20002',
  color: null,
  mileage: 120000,
  fuelType: 'diesel',
  transmission: 'automatic',
  engineSize: null,
  engineCode: null,
  imageUrl: null,
  customerId: null,
  customer: null,
  inspectionStatus: null,
}

function renderForm(over: { vehicle?: typeof SAVED; marine?: boolean } = {}): {
  onOpenChange: ReturnType<typeof vi.fn>
} {
  const onOpenChange = vi.fn()
  const form = (
    <TooltipProvider>
      <VehicleForm open onOpenChange={onOpenChange} vehicle={over.vehicle} distanceUnit="km" />
    </TooltipProvider>
  )
  render(
    over.marine ? <ServiceTypeProvider serviceType="marine">{form}</ServiceTypeProvider> : form
  )
  return { onOpenChange }
}

const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement

const fillNew = () => {
  fireEvent.input(field('make'), { target: { value: 'Volvo' } })
  fireEvent.input(field('model'), { target: { value: 'V70' } })
  fireEvent.input(field('year'), { target: { value: '2015' } })
}

const submit = async () => {
  const form = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
  await act(async () => {
    fireEvent.submit(form)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findVehiclesWithPlate).mockResolvedValue({ success: true, data: [] })
  vi.mocked(createVehicle).mockResolvedValue({
    success: true,
    data: { id: 'veh-new', make: 'Volvo', model: 'V70', year: 2015, licensePlate: 'ZZ10001' },
  } as never)
  vi.mocked(updateVehicle).mockResolvedValue({ success: true } as never)
})

describe('a plate another vehicle has', () => {
  it('names that vehicle and its owner under the plate, with a link', async () => {
    vi.mocked(findVehiclesWithPlate).mockResolvedValue({ success: true, data: [OTHER] })
    renderForm()
    const plate = field('licensePlate')
    fireEvent.input(plate, { target: { value: 'zz-10001' } })
    fireEvent.blur(plate)

    expect(await screen.findByText('Another vehicle has this plate:')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '2011 BMW 520d (ZZ Kari Testvik)' })
    expect(link).toHaveAttribute('href', '/vehicles/veh-other')
    expect(link).toHaveAttribute('target', '_blank')
    expect(findVehiclesWithPlate).toHaveBeenCalledWith({ plate: 'ZZ10001', excludeId: undefined })
  })

  it('stops the first save to show it, and saves on the second', async () => {
    vi.mocked(findVehiclesWithPlate).mockResolvedValue({ success: true, data: [OTHER] })
    renderForm()
    fillNew()
    fireEvent.input(field('licensePlate'), { target: { value: 'ZZ 10001' } })

    await submit()
    expect(createVehicle).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith(
      'Another vehicle has this plate. Check it, or save again to keep it anyway.'
    )
    expect(screen.getByText('Another vehicle has this plate:')).toBeInTheDocument()

    await submit()
    expect(createVehicle).toHaveBeenCalledTimes(1)
  })

  it('goes away when the plate is changed', async () => {
    vi.mocked(findVehiclesWithPlate).mockResolvedValue({ success: true, data: [OTHER] })
    renderForm()
    const plate = field('licensePlate')
    fireEvent.input(plate, { target: { value: 'ZZ 10001' } })
    fireEvent.blur(plate)
    await screen.findByText('Another vehicle has this plate:')
    fireEvent.change(plate, { target: { value: 'ZZ 10002' } })
    expect(screen.queryByText('Another vehicle has this plate:')).not.toBeInTheDocument()
  })

  it('is not asked about when an edit left the plate as it was', async () => {
    renderForm({ vehicle: SAVED })
    await submit()
    expect(findVehiclesWithPlate).not.toHaveBeenCalled()
    expect(updateVehicle).toHaveBeenCalledTimes(1)
  })

  it('speaks of a registration number in a boat workshop', async () => {
    vi.mocked(findVehiclesWithPlate).mockResolvedValue({ success: true, data: [OTHER] })
    renderForm({ marine: true })
    const plate = field('licensePlate')
    fireEvent.input(plate, { target: { value: 'NB-4521-E' } })
    fireEvent.blur(plate)
    expect(
      await screen.findByText('Another boat has this registration number:')
    ).toBeInTheDocument()
  })
})

describe('a VIN that does not look like one', () => {
  const NOTICE = "This doesn't look like a 17-character VIN. You can still save it."

  it('is said under the field once it is left, and the vehicle still saves', async () => {
    const { onOpenChange } = renderForm()
    fillNew()
    const vin = field('vin')
    fireEvent.input(vin, { target: { value: 'NOTAVIN-IOQ' } })
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
    fireEvent.blur(vin)
    expect(screen.getByText(NOTICE)).toBeInTheDocument()
    expect(vin).toHaveAccessibleDescription(NOTICE)
    expect(vin).not.toHaveAttribute('aria-invalid')

    await submit()
    expect(createVehicle).toHaveBeenCalledWith(expect.objectContaining({ vin: 'NOTAVIN-IOQ' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('says nothing for a real VIN', () => {
    renderForm()
    const vin = field('vin')
    fireEvent.input(vin, { target: { value: 'WBA5A71070G123456' } })
    fireEvent.blur(vin)
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
  })

  it('says nothing in a boat workshop, where it is a hull number', () => {
    renderForm({ marine: true })
    const vin = field('vin')
    fireEvent.input(vin, { target: { value: 'BWC12345A606' } })
    fireEvent.blur(vin)
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
  })
})
