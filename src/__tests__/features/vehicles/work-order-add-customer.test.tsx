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
import { createPortal } from 'react-dom'

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
// in as what it is to the page around it: a form in a portal, outside the
// work order's form in the document and inside it in React's tree.
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
    open
      ? createPortal(
          <form
            aria-label="new customer"
            onSubmit={(e) => {
              e.preventDefault()
              onCreated?.({ id: 'cus-new', name: defaults?.name ?? '', company: null })
            }}
          >
            <button type="submit">save new customer</button>
          </form>,
          document.body
        )
      : null,
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

type Over = Partial<Props> & {
  marine?: boolean
  canAddCustomer?: boolean
  noVehicle?: boolean
  /** The customer the saved vehicle has, as the page read it. */
  owner?: { id: string; name: string } | null
}

/** The card inside the work order's form, as the page mounts it. */
function renderCard(over: Over = {}) {
  const onCustomerAdded = vi.fn()
  const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
  const onFormInput = vi.fn()
  const tree = (now: Over) => {
    const { marine, canAddCustomer = true, noVehicle, owner = null, ...props } = now
    const card = (
      <BookingAccessProvider value={{ canBook: true, canAddCustomer }}>
        <form aria-label="work order" onSubmit={onFormSubmit} onInput={onFormInput}>
          <JobFactsCard
            record={
              {
                id: 'job-1',
                vehicle: noVehicle ? null : { ...VEHICLE, customer: owner },
                customer: null,
              } as unknown as Props['record']
            }
            currencyCode="EUR"
            initialData={
              { id: 'job-1', mileage: 50000, lastReading: 50000 } as Props['initialData']
            }
            vehicleName="2013 Land Rover Evoque"
            selectedVehicleId={noVehicle ? null : 'veh-1'}
            setSelectedVehicleId={vi.fn()}
            techName=""
            canSetCustomer
            onCustomerAdded={onCustomerAdded}
            {...props}
          />
        </form>
      </BookingAccessProvider>
    )
    return marine ? <ServiceTypeProvider serviceType="marine">{card}</ServiceTypeProvider> : card
  }
  const view = render(tree(over))
  return {
    onCustomerAdded,
    onFormSubmit,
    onFormInput,
    /** The page read the job again and hands the card what it found. */
    reread: (next: Over) => view.rerender(tree({ ...over, ...next })),
  }
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
    fireEvent.submit(screen.getByRole('form', { name: 'new customer' }))

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

  it('leaves the work order alone while a customer is searched for and added', async () => {
    const { onFormSubmit, onFormInput } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    // Typing in the search is not an edit of the work order.
    fireEvent.input(await screen.findByPlaceholderText('Search customers...'), {
      target: { value: 'Karim' },
    })
    expect(onFormInput).not.toHaveBeenCalled()

    // Saving the new customer's form does not submit the work order's.
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }))
    fireEvent.submit(screen.getByRole('form', { name: 'new customer' }))
    await waitFor(() =>
      expect(updateVehicle).toHaveBeenCalledWith({ id: 'veh-1', customerId: 'cus-new' })
    )
    expect(onFormSubmit).not.toHaveBeenCalled()
    expect(onFormInput).not.toHaveBeenCalled()
  })

  it('still counts a reading typed in the same card as an edit of the work order', () => {
    const { onFormInput } = renderCard()
    fireEvent.input(screen.getByLabelText('Mileage'), { target: { value: '50100' } })
    expect(onFormInput).toHaveBeenCalled()
  })

  it('offers to add a customer again when the owner is later taken off the vehicle', async () => {
    const { reread } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    fireEvent.click(await screen.findByText('Yacine Benali'))
    expect(await screen.findByRole('link', { name: 'Yacine Benali' })).toBeInTheDocument()

    // The page reads the job again and has the saved owner; later the owner is
    // removed on the vehicle's own page, and the next read finds none.
    reread({ owner: { id: 'cus-1', name: 'Yacine Benali' } })
    expect(screen.getByRole('link', { name: 'Yacine Benali' })).toBeInTheDocument()
    reread({ owner: null })
    await waitFor(() => expect(screen.getByText(SENTENCE)).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Yacine Benali' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add customer' })).toBeInTheDocument()
  })

  it('does not show the customer added to one vehicle on another', async () => {
    const { reread } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }))
    fireEvent.click(await screen.findByText('Yacine Benali'))
    expect(await screen.findByRole('link', { name: 'Yacine Benali' })).toBeInTheDocument()

    // The job was saved onto another vehicle, one with no owner.
    reread({
      record: {
        id: 'job-1',
        vehicle: { ...VEHICLE, id: 'veh-2', customer: null },
        customer: null,
      } as unknown as Props['record'],
    })
    await waitFor(() => expect(screen.getByText(SENTENCE)).toBeInTheDocument())
    // And back: what was added the first time is not brought out again.
    reread({})
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Yacine Benali' })).not.toBeInTheDocument()
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
