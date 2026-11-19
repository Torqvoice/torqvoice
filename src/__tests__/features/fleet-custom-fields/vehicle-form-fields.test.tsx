/**
 * The vehicle dialog for a workshop that asked for more: the fleet / unit
 * number, and fields of its own. Neither is drawn, sent or asked about for a
 * workshop that asked for neither. A required field of its own left empty
 * stops the save before anything is written, named by its label under the
 * field and in the message, with the focus on the first one.
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

const save = vi.hoisted(() => vi.fn())
const loadValues = vi.hoisted(() => vi.fn())
const loadDefinitions = vi.hoisted(() => vi.fn())
vi.mock('@/features/custom-fields/Actions/customFieldActions', () => ({
  getCustomFieldValues: loadValues,
  getFieldDefinitions: loadDefinitions,
  saveValidatedCustomFieldValues: save,
}))

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FleetNumberProvider } from '@/components/fleet-number-context'
import { RecordCustomFieldsProvider } from '@/components/record-custom-fields-context'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const VEHICLE = {
  id: 'veh-1',
  make: 'Volvo',
  model: 'FH',
  year: 2019,
  vin: null,
  licensePlate: 'ZZ 208',
  color: null,
  mileage: 1000,
  fuelType: 'diesel',
  transmission: 'automatic',
  engineSize: null,
  engineCode: null,
  fleetNumber: 'T-208' as string | null,
  imageUrl: null,
  customerId: null,
  customer: null,
  inspectionStatus: null,
}

const field = { options: null as string | null, required: true, value: '', isActive: true }
const FIELDS = [
  { ...field, id: 'tacho', name: 'tacho', label: 'Tachograph due', fieldType: 'text' },
  { ...field, id: 'depot', name: 'depot', label: 'Home depot', fieldType: 'text' },
  { ...field, id: 'note', name: 'note', label: 'Livery', fieldType: 'text', required: false },
]

function renderForm(
  workshop: { fleetNumber?: boolean; customFields?: boolean } = {},
  props: Partial<React.ComponentProps<typeof VehicleForm>> = {}
) {
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <FleetNumberProvider enabled={workshop.fleetNumber ?? false}>
        <RecordCustomFieldsProvider
          value={{ vehicle: workshop.customFields ?? false, customer: false }}
        >
          <VehicleForm
            open
            onOpenChange={onOpenChange}
            vehicle={VEHICLE}
            distanceUnit="km"
            {...props}
          />
        </RecordCustomFieldsProvider>
      </FleetNumberProvider>
    </TooltipProvider>
  )
  return { onOpenChange }
}

const sent = () => vi.mocked(updateVehicle).mock.calls[0][0] as Record<string, unknown>
const input = (id: string) =>
  screen.getByTestId(`custom-field-${id}`).querySelector('input') as HTMLInputElement
const pressSave = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  isVehicleLookupAvailable.mockResolvedValue({ success: true, data: {} })
  vi.mocked(updateVehicle).mockResolvedValue({ success: true } as never)
  save.mockResolvedValue({ success: true, data: { saved: true } })
  loadValues.mockResolvedValue({ success: true, data: FIELDS })
  loadDefinitions.mockResolvedValue({ success: true, data: FIELDS })
  Element.prototype.scrollIntoView = vi.fn()
})

describe('a workshop that asked for neither', () => {
  it('has no fleet number box, sends none, and asks nothing about fields of its own', async () => {
    renderForm()
    await screen.findByRole('dialog')
    expect(screen.queryByLabelText('Fleet / unit number')).not.toBeInTheDocument()
    expect(screen.queryByText('Custom Fields')).not.toBeInTheDocument()

    await pressSave()

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    // Not sent, so the number the vehicle holds is left as it is.
    expect(sent().fleetNumber).toBeUndefined()
    expect(loadValues).not.toHaveBeenCalled()
    expect(loadDefinitions).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('the fleet / unit number', () => {
  it('opens on what is saved and is sent with the save', async () => {
    renderForm({ fleetNumber: true })
    const box = (await screen.findByLabelText('Fleet / unit number')) as HTMLInputElement
    expect(box.value).toBe('T-208')

    fireEvent.change(box, { target: { value: 'Unit 14' } })
    await pressSave()

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(sent().fleetNumber).toBe('Unit 14')
  })

  it('is not sent for a vehicle whose page did not load it, so the save cannot clear it', async () => {
    const { fleetNumber: _unloaded, ...partial } = VEHICLE
    renderForm({ fleetNumber: true }, { vehicle: partial })
    await screen.findByLabelText('Fleet / unit number')

    await pressSave()

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(sent().fleetNumber).toBeUndefined()
  })
})

describe('the workshop’s own fields on a vehicle', () => {
  it('are loaded for the vehicle that is open and go with the vehicle’s own save', async () => {
    renderForm({ customFields: true })
    await screen.findByText('Custom Fields')
    expect(loadValues).toHaveBeenCalledWith('veh-1', 'vehicle')

    fireEvent.change(input('tacho'), { target: { value: 'March' } })
    fireEvent.change(input('depot'), { target: { value: 'North' } })
    await pressSave()

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    // One save, which the server checks and writes with the vehicle: no
    // second call that could succeed or fail on its own.
    expect(sent().customFields).toEqual({ tacho: 'March', depot: 'North', note: '' })
    expect(save).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('with one required field empty: nothing is saved, the field is named, and it has the focus', async () => {
    renderForm({ customFields: true })
    await screen.findByText('Custom Fields')
    fireEvent.change(input('depot'), { target: { value: 'North' } })

    await pressSave()

    expect(updateVehicle).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Tachograph due')
    const alert = within(screen.getByTestId('custom-field-tacho')).getByRole('alert')
    expect(alert).toHaveTextContent('Tachograph due is required')
    expect(input('tacho')).toHaveAttribute('aria-invalid', 'true')
    expect(input('tacho')).toHaveFocus()
    expect(input('depot')).not.toHaveAttribute('aria-invalid')
    // The dialog stays open on what was typed.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input('depot').value).toBe('North')
  })

  it('with two empty: names both, marks both, and focuses the first', async () => {
    renderForm({ customFields: true })
    await screen.findByText('Custom Fields')

    await pressSave()

    expect(updateVehicle).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Tachograph due, Home depot')
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual([
      'Tachograph due is required',
      'Home depot is required',
    ])
    expect(input('tacho')).toHaveFocus()
  })

  it('saves once the field is filled in, and the mark is gone as it is typed', async () => {
    renderForm({ customFields: true })
    await screen.findByText('Custom Fields')
    fireEvent.change(input('depot'), { target: { value: 'North' } })
    await pressSave()
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    fireEvent.change(input('tacho'), { target: { value: 'March' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await pressSave()

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
  })

  it('names the field the server refuses, when it was made required while the dialog was open', async () => {
    renderForm({ customFields: true })
    await screen.findByText('Custom Fields')
    fireEvent.change(input('tacho'), { target: { value: 'March' } })
    fireEvent.change(input('depot'), { target: { value: 'North' } })
    vi.mocked(updateVehicle).mockResolvedValue({
      success: false,
      error: 'Not saved. Fill in: Livery',
      customFieldErrors: [{ fieldId: 'note', label: 'Livery', issue: 'required' }],
    } as never)

    await pressSave()

    expect(updateVehicle).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Livery')
    expect(within(screen.getByTestId('custom-field-note')).getByRole('alert')).toHaveTextContent(
      'Livery is required'
    )
    // Nothing was saved, and the dialog is still open on what was typed.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input('tacho').value).toBe('March')
  })

  it('waits for the fields when Save is pressed before they have loaded, and refuses the empty one', async () => {
    let finishLoading: (value: unknown) => void = () => undefined
    loadValues.mockReturnValue(new Promise((resolve) => (finishLoading = resolve)))
    renderForm({ customFields: true })
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await act(async () => {
      finishLoading({ success: true, data: FIELDS })
    })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Tachograph due, Home depot')
    )
    expect(updateVehicle).not.toHaveBeenCalled()
  })
})

describe('a new vehicle with fields of the workshop’s own', () => {
  const add = async () => {
    fireEvent.change(screen.getByLabelText(/^Make/), { target: { value: 'Volvo' } })
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: 'FH' } })
    fireEvent.change(screen.getByLabelText(/^Year/), { target: { value: '2019' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    })
  }

  it('is not created while a required field is empty', async () => {
    renderForm({ customFields: true }, { vehicle: undefined })
    await screen.findByText('Custom Fields')
    expect(loadDefinitions).toHaveBeenCalledWith('vehicle')

    await add()

    expect(createVehicle).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Tachograph due, Home depot')
    expect(input('tacho')).toHaveFocus()
  })

  it('is created with its fields in one save', async () => {
    vi.mocked(createVehicle).mockResolvedValue({
      success: true,
      data: { id: 'veh-new', make: 'Volvo', model: 'FH', year: 2019 },
    } as never)
    renderForm({ customFields: true }, { vehicle: undefined })
    await screen.findByText('Custom Fields')
    fireEvent.change(input('tacho'), { target: { value: 'March' } })
    fireEvent.change(input('depot'), { target: { value: 'North' } })

    await add()

    await waitFor(() => expect(createVehicle).toHaveBeenCalled())
    expect(vi.mocked(createVehicle).mock.calls[0][0]).toMatchObject({
      customFields: { tacho: 'March', depot: 'North', note: '' },
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('refused by the server: nothing is made, the dialog stays open on what was typed', async () => {
    vi.mocked(createVehicle).mockResolvedValue({
      success: false,
      error: 'Not saved. Fill in: Home depot',
      customFieldErrors: [{ fieldId: 'depot', label: 'Home depot', issue: 'required' }],
    } as never)
    const { onOpenChange } = renderForm({ customFields: true }, { vehicle: undefined })
    await screen.findByText('Custom Fields')
    fireEvent.change(input('tacho'), { target: { value: 'March' } })
    fireEvent.change(input('depot'), { target: { value: 'North' } })

    await add()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Home depot'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(input('tacho').value).toBe('March')
    expect(within(screen.getByTestId('custom-field-depot')).getByRole('alert')).toHaveTextContent(
      'Home depot is required'
    )
  })
})
