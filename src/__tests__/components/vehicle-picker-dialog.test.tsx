/**
 * The new work order picker speaks the workshop's language.
 *
 * A marine workshop picks a vessel, adds a vessel, and gives it a registration
 * number rather than a licence plate. An automotive workshop's wording has to
 * stay exactly as it was, because the end-to-end specs find the dialog and its
 * buttons by those words.
 */

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ServiceTypeProvider } from '@/components/service-type-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ createVehicle: vi.fn() }))
vi.mock('@/features/vehicles/Actions/createDraftServiceRecord', () => ({
  createDraftCounterSale: vi.fn(),
}))
vi.mock('@/features/customers/Actions/customerActions', () => ({ createCustomer: vi.fn() }))
vi.mock('@/features/quotes/Components/CustomerCombobox', () => ({ CustomerCombobox: () => null }))
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
  return render(
    <ServiceTypeProvider serviceType={serviceType}>
      <VehiclePickerDialog
        open
        onOpenChange={vi.fn()}
        vehicles={props.empty ? [] : [unregistered]}
        customers={[]}
        title={props.title}
      />
    </ServiceTypeProvider>
  )
}

describe('VehiclePickerDialog, automotive', () => {
  it('keeps its vehicle wording on the select step', () => {
    renderPicker('automotive')
    expect(screen.getByRole('dialog', { name: 'Select Vehicle for Work Order' })).toBeVisible()
    expect(screen.getByPlaceholderText('Search vehicles...')).toBeInTheDocument()
    expect(screen.getByText('No plate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add New Vehicle' })).toBeInTheDocument()
  })

  it("uses the caller's title", () => {
    renderPicker('automotive', { title: 'Select Vehicle' })
    expect(screen.getByRole('dialog', { name: 'Select Vehicle' })).toBeVisible()
  })

  it('says no vehicles were found when there are none', () => {
    renderPicker('automotive', { empty: true })
    expect(screen.getByText('No vehicles found.')).toBeInTheDocument()
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
  it('asks for a vessel on the select step, whatever title the caller passed', () => {
    renderPicker('marine', { title: 'Select Vehicle' })
    expect(screen.getByRole('dialog', { name: 'Select Vessel for Work Order' })).toBeVisible()
    expect(screen.getByPlaceholderText('Search vessels...')).toBeInTheDocument()
    expect(screen.getByText('No registration')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add New Vessel' })).toBeInTheDocument()
    expect(screen.queryByText(/vehicle/i)).toBeNull()
  })

  it('says no vessels were found when there are none', () => {
    renderPicker('marine', { empty: true })
    expect(screen.getByText('No vessels found.')).toBeInTheDocument()
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
