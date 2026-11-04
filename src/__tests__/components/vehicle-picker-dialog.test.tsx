/**
 * The new work order picker speaks the workshop's language.
 *
 * A marine workshop picks a vessel, adds a vessel, and gives it a registration
 * number rather than a licence plate. An automotive workshop's wording has to
 * stay exactly as it was, because the end-to-end specs find the dialog and its
 * buttons by those words.
 */

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ServiceTypeProvider } from '@/components/service-type-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
const searchVehicles = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  createVehicle,
  searchVehicles,
}))
vi.mock('@/features/vehicles/Actions/createDraftServiceRecord', () => ({
  createDraftCounterSale: vi.fn(),
}))
const createVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/features/customers/Actions/customerActions', () => ({ createCustomer: vi.fn() }))
// Stands in for the server search: one button picks a customer, and it names
// whoever it was handed, which is what a user sees in the real one.
vi.mock('@/features/quotes/Components/CustomerCombobox', () => ({
  CustomerCombobox: ({
    initialCustomer,
    onChange,
  }: {
    initialCustomer?: { name: string } | null
    onChange: (id: string, c: { id: string; name: string; company: null }) => void
  }) => (
    <button
      type="button"
      onClick={() => onChange('c1', { id: 'c1', name: 'Ann Berg', company: null })}
    >
      {initialCustomer?.name ?? 'Select a customer (optional)'}
    </button>
  ),
}))
vi.mock('@/components/upgrade-gate', () => ({ handleGated: () => false }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const { VehiclePickerDialog } = await import('@/components/vehicle-picker-dialog')

const unregistered = {
  id: 'v1',
  make: 'Yamaha',
  model: 'F150',
  year: 2020,
  licensePlate: null,
  customer: null,
}

function renderPicker(serviceType: string, props: { title?: string; empty?: boolean } = {}) {
  searchVehicles.mockReset()
  searchVehicles.mockResolvedValue({
    success: true,
    data: props.empty ? [] : [unregistered],
  })
  return render(
    <ServiceTypeProvider serviceType={serviceType}>
      <VehiclePickerDialog open onOpenChange={vi.fn()} title={props.title} />
    </ServiceTypeProvider>
  )
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

  it('names the customer a new vehicle will be saved to, after going back and forth', async () => {
    renderPicker('automotive')
    createVehicle.mockReset()
    createVehicle.mockResolvedValue({ success: true, data: { id: 'v9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Parts-Only Sale' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select a customer (optional)' }))
    fireEvent.click(screen.getAllByRole('button')[0]) // back
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))

    expect(screen.getByRole('button', { name: 'Ann Berg' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Make *'), { target: { value: 'Volvo' } })
    fireEvent.change(screen.getByLabelText('Model *'), { target: { value: 'V70' } })
    fireEvent.change(screen.getByLabelText('Year *'), { target: { value: '2015' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create & Continue' }))
    await waitFor(() =>
      expect(createVehicle).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1' }))
    )
  })

  it('keeps its vehicle wording on the create step', () => {
    renderPicker('automotive')
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vehicle' }))
    expect(screen.getByRole('dialog', { name: 'Add New Vehicle' })).toBeVisible()
    expect(screen.getByLabelText('Make *')).toHaveAttribute('placeholder', 'e.g. Toyota')
    expect(screen.getByLabelText('License Plate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create & Continue' })).toBeInTheDocument()
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

  it('asks for what a boat has on the create step', () => {
    renderPicker('marine')
    fireEvent.click(screen.getByRole('button', { name: 'Add New Vessel' }))
    expect(screen.getByRole('dialog', { name: 'Add New Vessel' })).toBeVisible()
    expect(screen.getByLabelText('Manufacturer *')).toHaveAttribute(
      'placeholder',
      'e.g. Boston Whaler'
    )
    expect(screen.getByLabelText('Registration Number')).toBeInTheDocument()
    expect(screen.queryByText('License Plate')).toBeNull()
    expect(screen.getByRole('button', { name: 'Create & Continue' })).toBeInTheDocument()
  })

  it('offers a parts sale without a vessel', () => {
    renderPicker('marine')
    fireEvent.click(screen.getByRole('button', { name: 'Parts-Only Sale' }))
    expect(
      screen.getByText('Create an invoice without a vessel, for over-the-counter parts sales.')
    ).toBeInTheDocument()
  })
})
