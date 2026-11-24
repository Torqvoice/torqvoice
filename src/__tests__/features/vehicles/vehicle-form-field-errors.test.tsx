/**
 * A vehicle the server refused: each problem said under its own field in the
 * person's words, not "year: Year is too far in the future" in a box, the
 * first field focused and everything typed kept. The year and the reading
 * carry the limits a browser can check before anything is sent.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vehicles/veh-1',
  useSearchParams: () => new URLSearchParams(),
}))
const modalOpen = vi.hoisted(() => vi.fn())
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: modalOpen }) }))
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
  getVehicleScanAvailability: vi.fn(async () => ({ success: true, data: false })),
}))
const getVehicleLookupAvailability = vi.hoisted(() => vi.fn())
const lookupVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/integrations/Actions/vehicleLookupActions', () => ({
  getVehicleLookupAvailability,
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
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const VEHICLE = {
  id: 'veh-1',
  make: 'BMW',
  model: '5-Serie F11',
  year: 2011,
  vin: null,
  licensePlate: 'ZZ10001',
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

function renderForm() {
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <VehicleForm open onOpenChange={onOpenChange} vehicle={VEHICLE} distanceUnit="km" />
    </TooltipProvider>
  )
  return { onOpenChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  getVehicleLookupAvailability.mockResolvedValue({ success: true, data: {} })
})

describe('a vehicle the server refused', () => {
  it('says each problem under its field and focuses the first', async () => {
    vi.mocked(updateVehicle).mockResolvedValue({
      success: false,
      error: 'year: Year is too far in the future. mileage: Too small: expected number to be >=0',
      fieldErrors: [
        { field: 'mileage', issue: 'negative' },
        { field: 'year', issue: 'tooLarge', limit: 2028 },
      ],
    })
    const { onOpenChange } = renderForm()
    const year = (await screen.findByLabelText('Year *')) as HTMLInputElement
    fireEvent.change(year, { target: { value: '2099' } })

    const form = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(await screen.findByText('Must be 2028 or less.')).toBeInTheDocument()
    expect(screen.getByText("Can't be negative.")).toBeInTheDocument()
    expect(year).toHaveAttribute('aria-invalid', 'true')
    const mileage = document.querySelector('input[name="mileage"]') as HTMLInputElement
    expect(mileage).toHaveAttribute('aria-invalid', 'true')
    // The year comes first on the form, whatever order the schema found them in.
    expect(year).toHaveFocus()
    expect(screen.queryByText(/too far in the future/)).not.toBeInTheDocument()
    expect(modalOpen).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Check the marked fields.')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(year.value).toBe('2099')
  })

  it('lets the browser check the year and the reading before anything is sent', async () => {
    renderForm()
    const year = await screen.findByLabelText('Year *')
    expect(year).toHaveAttribute('min', '1900')
    expect(year).toHaveAttribute('max', String(new Date().getFullYear() + 2))
    expect(document.querySelector('input[name="mileage"]')).toHaveAttribute('min', '0')
  })
})
