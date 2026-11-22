/**
 * The Customer box on a work order whose vehicle has no owner. It used to say
 * "No customer on this work order." and nothing else, and a new workshop
 * clicked that sentence five times before giving up. Now the sentence and an
 * "Add customer" button open the customer picker; the customer picked is put
 * on the vehicle and the box fills in. Someone who may not edit vehicles, and
 * a locked invoice, keep the sentence alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// Radix measures the popover's anchor; jsdom has no ResizeObserver, and
// nothing here needs measuring.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

const { updateVehicle, searchCustomers } = vi.hoisted(() => ({
  updateVehicle: vi.fn(),
  searchCustomers: vi.fn(),
}))

vi.mock('@/features/quotes/Components/VehicleCombobox', () => ({ VehicleCombobox: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ updateVehicle }))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  searchCustomers,
  createCustomer: vi.fn(),
}))
// The new-customer form is its own screen with its own tests; here it stands
// in as a button that reports the customer it made.
vi.mock('@/features/customers/Components/CustomerForm', () => ({
  CustomerForm: ({
    open,
    defaults,
    onCreated,
  }: {
    open: boolean
    defaults?: { name?: string }
    onCreated?: (c: { id: string; name: string; company: string | null }) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onCreated?.({ id: 'cus-new', name: defaults?.name ?? '', company: null })}
      >
        save new customer
      </button>
    ) : null,
}))

import { BookingAccessProvider } from '@/components/booking-launcher'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { JobFactsCard } from '@/features/vehicles/Components/service-page/modern/JobFactsCard'

type Props = React.ComponentProps<typeof JobFactsCard>

const SENTENCE = 'No customer on this work order.'
const VEHICLE = {
  id: 'veh-1',
  make: 'Land Rover',
  model: 'Evoque',
  year: 2013,
  vin: null,
  licensePlate: '094425-113-16',
  mileage: 50000,
  customer: null,
}

function renderCard(
  over: Partial<Props> & { marine?: boolean; canAddCustomer?: boolean; noVehicle?: boolean } = {}
) {
  const { marine, canAddCustomer = true, noVehicle, ...props } = over
  const onCustomerAdded = vi.fn()
  const card = (
    <BookingAccessProvider value={{ canBook: true, canAddCustomer }}>
      <JobFactsCard
        record={
          {
            id: 'job-1',
            vehicle: noVehicle ? null : VEHICLE,
            customer: null,
          } as unknown as Props['record']
        }
        currencyCode="EUR"
        initialData={{ id: 'job-1', mileage: 50000, lastReading: 50000 } as Props['initialData']}
        vehicleName="2013 Land Rover Evoque"
        selectedVehicleId={noVehicle ? null : 'veh-1'}
        setSelectedVehicleId={vi.fn()}
        techName=""
        canSetCustomer
        onCustomerAdded={onCustomerAdded}
        {...props}
      />
    </BookingAccessProvider>
  )
  render(marine ? <ServiceTypeProvider serviceType="marine">{card}</ServiceTypeProvider> : card)
  return { onCustomerAdded }
}

beforeEach(() => {
  updateVehicle.mockReset().mockResolvedValue({ success: true, data: { id: 'veh-1' } })
  searchCustomers.mockReset().mockResolvedValue({
    success: true,
    data: [{ id: 'cus-1', name: 'Yacine Benali', company: null }],
  })
})

describe('a work order whose vehicle has no customer', () => {
  it('keeps the sentence and offers a button to add a customer', () => {
    renderCard()
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add customer' })).toBeInTheDocument()
  })

  it('puts the customer picked on the vehicle and fills the box', async () => {
    const { onCustomerAdded } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(
      screen.getByText('The customer you pick becomes the owner of this vehicle.')
    ).toBeInTheDocument()
    fireEvent.click(await screen.findByText('Yacine Benali'))

    await waitFor(() =>
      expect(updateVehicle).toHaveBeenCalledWith({ id: 'veh-1', customerId: 'cus-1' })
    )
    expect(await screen.findByRole('link', { name: 'Yacine Benali' })).toHaveAttribute(
      'href',
      '/customers/cus-1'
    )
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument()
    expect(onCustomerAdded).toHaveBeenCalledTimes(1)
  })

  it('opens the picker from a click on the sentence itself', async () => {
    renderCard()
    fireEvent.click(screen.getByText(SENTENCE))
    expect(await screen.findByText('Yacine Benali')).toBeInTheDocument()
  })

  it('adds a new customer from the picker, starting from what was searched for', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    fireEvent.change(await screen.findByPlaceholderText('Search customers...'), {
      target: { value: 'Karim' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }))
    fireEvent.click(screen.getByRole('button', { name: 'save new customer' }))

    await waitFor(() =>
      expect(updateVehicle).toHaveBeenCalledWith({ id: 'veh-1', customerId: 'cus-new' })
    )
    expect(await screen.findByRole('link', { name: 'Karim' })).toBeInTheDocument()
  })

  it('does not offer a new customer to someone who may not add one', async () => {
    renderCard({ canAddCustomer: false })
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    await screen.findByText('Yacine Benali')
    expect(screen.queryByRole('button', { name: 'Add Customer' })).not.toBeInTheDocument()
  })

  it('says so and keeps the box empty when the save is refused', async () => {
    updateVehicle.mockResolvedValue({ success: false, error: 'Vehicle not found' })
    const { onCustomerAdded } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    fireEvent.click(await screen.findByText('Yacine Benali'))

    await waitFor(() => expect(updateVehicle).toHaveBeenCalled())
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Yacine Benali' })).not.toBeInTheDocument()
    expect(onCustomerAdded).not.toHaveBeenCalled()
  })

  it('speaks of the vessel in a marine workshop', () => {
    renderCard({ marine: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(
      screen.getByText('The customer you pick becomes the owner of this vessel.')
    ).toBeInTheDocument()
  })

  it('shows the sentence alone to someone who may not edit vehicles', () => {
    renderCard({ canSetCustomer: false })
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add customer' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(SENTENCE))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows the sentence alone on a locked invoice, where the vehicle cannot be changed either', () => {
    renderCard({ locked: true })
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add customer' })).not.toBeInTheDocument()
  })

  it('shows the sentence alone on a job with no vehicle to put the customer on', () => {
    renderCard({ noVehicle: true })
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add customer' })).not.toBeInTheDocument()
  })
})
