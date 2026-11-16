/**
 * Booking from anywhere: "Book appointment" on any screen opens the booking
 * dialog with the car and customer the asker already has, on the workshop's
 * today, and nothing at all for someone who may not book.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// Far from UTC: in Auckland it is already tomorrow.
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: 'Pacific/Auckland',
    weekStartDay: 1,
  }),
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), loading: vi.fn() },
}))
vi.mock('@/components/service-type-context', () => ({ useServiceType: () => 'automotive' }))
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ content }: { content: string }) => <textarea value={content} readOnly />,
}))
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
const createBooking = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/createBooking', () => ({ createBooking }))
vi.mock('@/features/calendar/Actions/updateBooking', () => ({ updateBooking: vi.fn() }))
vi.mock('@/features/calendar/Actions/getBooking', () => ({ getBooking: vi.fn() }))
vi.mock('@/features/calendar/Actions/getBookingOptions', () => ({
  getBookingOptions: vi.fn(async () => ({
    success: true,
    data: { channels: ['in_app', 'email'], video: [] },
  })),
}))
vi.mock('@/features/integrations/Actions/integrationActions', () => ({
  createServiceMeeting: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  searchVehicles: vi.fn(async () => ({ success: true, data: [] })),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
}))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  searchCustomers: vi.fn(async () => ({ success: true, data: [] })),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  findOwnerCandidates: vi.fn(async () => ({ success: true, data: [] })),
  getCustomerOption: vi.fn(async () => ({ success: true, data: null })),
}))

import { BookingAccessProvider, openBooking } from '@/components/booking-launcher'
import { BookingHost } from '@/features/calendar/Components/BookingHost'

const karisCar = {
  id: 'veh-1',
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  licensePlate: 'AB12345',
  customerId: 'cust-1',
  customer: { id: 'cust-1', name: 'Kari Nordmann' },
}

function renderHost(canBook = true) {
  render(
    <BookingAccessProvider value={{ canBook }}>
      <BookingHost />
    </BookingAccessProvider>
  )
}

/** The picker under a field's label in the form: "Customer", "Vehicle". */
function fieldUnder(label: string) {
  const row = screen.getByText(label, { selector: 'p' }).parentElement as HTMLElement
  return within(row).getByRole('combobox')
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T20:00:00Z'))
  createBooking.mockResolvedValue({
    success: true,
    data: {
      kind: 'appointment',
      id: 'appt-1',
      ref: 'Service',
      vehicleId: 'veh-1',
      overbooked: false,
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BookingHost', () => {
  it('opens the booking with the car and its owner, on the workshop today', async () => {
    renderHost()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => openBooking({ vehicle: karisCar }))
    expect(await screen.findByRole('dialog', { name: 'Book appointment' })).toBeInTheDocument()
    expect(fieldUnder('Vehicle')).toHaveTextContent('2012 Volvo V70 (AB12345)')
    expect(fieldUnder('Customer')).toHaveTextContent('Kari Nordmann')

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Appointment' }), { button: 0 })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Service' } })
    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }))

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        // 20:00 UTC on the 16th is the 17th in Auckland.
        startDate: '2026-11-17',
      })
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('opens an empty booking when asked with nothing', async () => {
    renderHost()
    act(() => openBooking())
    expect(await screen.findByRole('dialog', { name: 'Book appointment' })).toBeInTheDocument()
    expect(fieldUnder('Vehicle')).toHaveTextContent('Select vehicle')
    expect(fieldUnder('Customer')).toHaveTextContent('Select customer')
  })

  it('opens nothing for someone who may not book', async () => {
    renderHost(false)
    act(() => openBooking({ vehicle: karisCar }))
    await act(async () => undefined)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
