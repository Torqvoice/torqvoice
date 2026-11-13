/**
 * Booking a car in from the calendar: pick who, say what needs doing, and
 * the dialog books it for the day and time the calendar was opened on,
 * without sending anybody to the work order page.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: 'UTC',
    weekStartDay: 1,
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const bookAppointment = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/bookAppointment', () => ({ bookAppointment }))

const annasCar = {
  id: 'v-anna',
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  licensePlate: 'ANNA-1',
  customerId: 'anna',
  customer: { id: 'anna', name: 'Anna Berg' },
}
const searchVehicles = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ searchVehicles }))
const searchCustomers = vi.hoisted(() => vi.fn())
vi.mock('@/features/customers/Actions/customerActions', () => ({ searchCustomers }))

const { toast } = await import('sonner')
const { BookAppointmentDialog } = await import(
  '@/features/calendar/Components/BookAppointmentDialog'
)

function renderDialog(props: { defaultTime?: string } = {}) {
  const onBooked = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <BookAppointmentDialog
      open
      onOpenChange={onOpenChange}
      defaultDate="2026-11-17"
      defaultTime={props.defaultTime}
      onBooked={onBooked}
    />
  )
  const [customerField, vehicleField] = screen.getAllByRole('combobox')
  return { onBooked, onOpenChange, customerField, vehicleField }
}

const bookButton = () => screen.getByRole('button', { name: 'Book appointment' })

beforeEach(() => {
  vi.clearAllMocks()
  searchVehicles.mockResolvedValue({ success: true, data: [annasCar] })
  searchCustomers.mockResolvedValue({
    success: true,
    data: [],
  })
  bookAppointment.mockResolvedValue({
    success: true,
    data: { id: 'job-1', vehicleId: 'v-anna', invoiceNumber: '2026-1044' },
  })
})

describe('BookAppointmentDialog', () => {
  it("books the car for its owner at the slot's day and time, for the hours given", async () => {
    const { onBooked, onOpenChange, customerField, vehicleField } = renderDialog({
      defaultTime: '09:30',
    })

    fireEvent.click(vehicleField)
    fireEvent.click(await screen.findByRole('option', { name: /Volvo V70/ }))
    // The owner comes with the car.
    expect(customerField).toHaveTextContent('Anna Berg')
    expect(vehicleField).toHaveTextContent('2015 Volvo V70 (ANNA-1)')

    fireEvent.change(screen.getByLabelText('Work needed'), {
      target: { value: 'Front brakes squeal\nOil service' },
    })
    fireEvent.change(screen.getByLabelText('Estimated hours'), { target: { value: '1.5' } })
    fireEvent.click(bookButton())

    await waitFor(() => expect(onBooked).toHaveBeenCalled())
    expect(bookAppointment).toHaveBeenCalledWith({
      vehicleId: 'v-anna',
      customerId: 'anna',
      work: 'Front brakes squeal\nOil service',
      date: '2026-11-17',
      time: '09:30',
      durationMinutes: 90,
    })
    expect(toast.success).toHaveBeenCalledWith('Appointment booked')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('will not book until it knows who for, what for and when', async () => {
    const { vehicleField } = renderDialog()
    fireEvent.change(screen.getByLabelText('Work needed'), {
      target: { value: 'Winter tyres on' },
    })
    expect(bookButton()).toBeDisabled()

    fireEvent.click(vehicleField)
    fireEvent.click(await screen.findByRole('option', { name: /Volvo V70/ }))
    // Opened from a day rather than a time slot: the time is still missing.
    expect(bookButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } })
    expect(bookButton()).toBeEnabled()
  })

  it('keeps the dialog open and says why when the booking is refused', async () => {
    bookAppointment.mockResolvedValue({ success: false, error: 'Insufficient permissions' })
    const { onBooked, onOpenChange, vehicleField } = renderDialog({ defaultTime: '08:00' })
    fireEvent.click(vehicleField)
    fireEvent.click(await screen.findByRole('option', { name: /Volvo V70/ }))
    fireEvent.change(screen.getByLabelText('Work needed'), { target: { value: 'Service' } })
    fireEvent.click(bookButton())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Insufficient permissions'))
    expect(onBooked).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(within(screen.getByRole('dialog')).getByLabelText('Work needed')).toHaveValue('Service')
  })
})
