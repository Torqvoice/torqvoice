/**
 * The booking dialog on the calendar: a title, an appointment or a work
 * order, when, who, and the notifications before it. It changes a booking
 * that is still only a booking, and turns an appointment into a work order.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '@/features/calendar/Actions/calendarActions'
import type { BookingForEdit } from '@/features/calendar/Actions/getBooking'

// Radix measures and captures pointers; jsdom does neither, and nothing here
// needs measuring.
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

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: 'UTC',
    weekStartDay: 1,
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/service-type-context', () => ({ useServiceType: () => 'automotive' }))
// Tiptap does not run in jsdom; a plain text box stands in for the editor.
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({
    content,
    onChange,
    placeholder,
  }: {
    content: string
    onChange: (html: string) => void
    placeholder?: string
  }) => (
    <textarea
      placeholder={placeholder}
      value={content}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

const createBooking = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/createBooking', () => ({ createBooking }))
const updateBooking = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/updateBooking', () => ({ updateBooking }))
const getBooking = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/getBooking', () => ({ getBooking }))
const getBookingOptions = vi.hoisted(() => vi.fn())
vi.mock('@/features/calendar/Actions/getBookingOptions', () => ({ getBookingOptions }))
const createServiceMeeting = vi.hoisted(() => vi.fn())
vi.mock('@/features/integrations/Actions/integrationActions', () => ({ createServiceMeeting }))
const searchVehicles = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ searchVehicles }))
const searchCustomers = vi.hoisted(() => vi.fn())
vi.mock('@/features/customers/Actions/customerActions', () => ({ searchCustomers }))

import { toast } from 'sonner'
import { BookingDialog } from '@/features/calendar/Components/BookingDialog'

const kari = { id: 'cust-1', name: 'Kari Nordmann', company: null }
const karisCar = {
  id: 'veh-1',
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  licensePlate: 'AB12345',
  customerId: 'cust-1',
  customer: { id: 'cust-1', name: 'Kari Nordmann' },
}

function calendarEvent(partial: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'appt-1',
    title: 'Call Kari',
    date: '2026-11-16',
    time: '09:30',
    type: 'appointment',
    status: 'scheduled',
    vehicleId: null,
    vehicleLabel: '',
    customerName: 'Kari Nordmann',
    invoiceNumber: null,
    amount: null,
    ...partial,
  } as CalendarEvent
}

function loadedBooking(partial: Partial<BookingForEdit> = {}): BookingForEdit {
  return {
    kind: 'appointment',
    id: 'appt-1',
    title: 'Call Kari',
    description: '',
    customer: kari,
    vehicle: null,
    startDate: '2026-11-16',
    startTime: '09:30',
    endDate: '2026-11-16',
    endTime: '10:30',
    work: '',
    notifications: [{ channel: 'in_app', amount: 1, unit: 'hours', atTime: null }],
    locked: { who: false, work: false },
    meeting: null,
    ...partial,
  }
}

async function renderDialog(props: Partial<Parameters<typeof BookingDialog>[0]> = {}) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <BookingDialog
      open
      onOpenChange={onOpenChange}
      defaultDate="2026-11-16"
      defaultTime="09:30"
      onSaved={onSaved}
      {...props}
    />
  )
  // What the workshop offers arrives after the dialog opens.
  await waitFor(() => expect(getBookingOptions).toHaveBeenCalled())
  await act(async () => undefined)
  return { onSaved, onOpenChange }
}

/** Types a concern into the list's add row and takes it with Enter. */
function addConcern(text: string) {
  const field = screen.getByLabelText('Add a concern and press Enter')
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
}

const titleField = () => screen.getByLabelText('Title')
const saveButton = (name = 'Book appointment') => screen.getByRole('button', { name })
const kindTab = (name: 'Appointment' | 'Work order') => screen.getByRole('tab', { name })
/** The picker under a field's label in the form: "Customer", "Vehicle". */
function fieldUnder(label: string) {
  const row = screen.getByText(label, { selector: 'p' }).parentElement as HTMLElement
  return within(row).getByRole('combobox')
}
const customerField = () => fieldUnder('Customer')
const vehicleField = () => fieldUnder('Vehicle')

function chooseKind(name: 'Appointment' | 'Work order') {
  // Radix tabs switch on mouse down.
  fireEvent.mouseDown(kindTab(name), { button: 0 })
}

/** Opens a dropdown in the form and picks an option from it. */
async function pick(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

async function chooseCustomer() {
  fireEvent.click(customerField())
  fireEvent.click(await screen.findByRole('option', { name: 'Kari Nordmann' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  getBookingOptions.mockResolvedValue({
    success: true,
    data: { channels: ['in_app', 'email'], video: [] },
  })
  searchCustomers.mockResolvedValue({ success: true, data: [kari] })
  // The car list for a customer is empty, so choosing one picks no car for them.
  searchVehicles.mockImplementation(async (_q, _size, _offset, customerId?: string) => ({
    success: true,
    data: customerId ? [] : [karisCar],
  }))
  createBooking.mockResolvedValue({
    success: true,
    data: {
      kind: 'appointment',
      id: 'appt-1',
      ref: 'Call Kari',
      vehicleId: null,
      overbooked: false,
    },
  })
  updateBooking.mockResolvedValue({
    success: true,
    data: {
      kind: 'appointment',
      id: 'appt-1',
      ref: 'Call Kari',
      vehicleId: null,
      overbooked: false,
    },
  })
  getBooking.mockResolvedValue({ success: true, data: loadedBooking() })
})

describe('a new booking', () => {
  it('books an appointment with the time given and a notice in the app an hour before', async () => {
    const { onSaved, onOpenChange } = await renderDialog()

    fireEvent.change(titleField(), { target: { value: 'Call Kari' } })
    chooseKind('Appointment')
    // The end keeps the length when the start moves.
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '10:00' } })
    expect(screen.getByLabelText('End')).toHaveValue('11:00')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '11:30' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking).toHaveBeenCalledTimes(1)
    const sent = createBooking.mock.calls[0][0]
    expect(sent).toMatchObject({
      kind: 'appointment',
      title: 'Call Kari',
      startDate: '2026-11-16',
      startTime: '10:00',
      endDate: '2026-11-16',
      endTime: '11:30',
    })
    expect(sent.id).toBeUndefined()
    expect(sent.fromAppointmentId).toBeUndefined()
    expect(sent.work).toBeUndefined()
    expect(sent.notifications).toEqual([
      { channel: 'in_app', amount: 1, unit: 'hours', atTime: null },
    ])
    expect(updateBooking).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Appointment booked')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('will not save without a title or with the end before the start', async () => {
    await renderDialog()
    chooseKind('Appointment')
    expect(saveButton()).toBeDisabled()

    fireEvent.change(titleField(), { target: { value: 'Call Kari' } })
    expect(saveButton()).toBeEnabled()

    fireEvent.change(screen.getByLabelText('End'), { target: { value: '09:00' } })
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText('The end has to be after the start, and at most a week later.')
    ).toBeInTheDocument()
  })

  it('will not book a work order until it knows the customer or the car', async () => {
    createBooking.mockResolvedValue({
      success: true,
      data: {
        kind: 'workOrder',
        id: 'job-1',
        ref: '2026-1044',
        vehicleId: null,
        overbooked: false,
      },
    })
    const { onSaved } = await renderDialog()

    chooseKind('Work order')
    fireEvent.change(titleField(), { target: { value: 'Brake job' } })
    // Each concern is typed on its own row and Enter takes it.
    addConcern('Front brakes squeal')
    addConcern('Oil service')
    expect(screen.getByLabelText('Concern 1')).toHaveValue('Front brakes squeal')
    expect(screen.getByLabelText('Concern 2')).toHaveValue('Oil service')
    expect(saveButton()).toBeDisabled()

    await chooseCustomer()
    expect(customerField()).toHaveTextContent('Kari Nordmann')
    expect(saveButton()).toBeEnabled()
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workOrder',
        title: 'Brake job',
        customerId: 'cust-1',
        vehicleId: undefined,
        work: 'Front brakes squeal\nOil service',
      })
    )
  })

  it('says so when no bay was free, though it booked all the same', async () => {
    createBooking.mockResolvedValue({
      success: true,
      data: { kind: 'workOrder', id: 'job-1', ref: '2026-1044', vehicleId: null, overbooked: true },
    })
    const { onSaved } = await renderDialog()
    chooseKind('Work order')
    fireEvent.change(titleField(), { target: { value: 'Brake job' } })
    await chooseCustomer()
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith(
      'Appointment booked, but no bay or technician is free at that time. Check the work board.'
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('starts on the kind this person booked last', async () => {
    window.localStorage.setItem('torqvoice.calendar.bookingKind', 'appointment')
    await renderDialog()
    expect(kindTab('Appointment')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText('Add a concern and press Enter')).not.toBeInTheDocument()
  })
})

describe('notifications', () => {
  it('adds a notice in days at a time of day, and removes one', async () => {
    const { onSaved } = await renderDialog()
    chooseKind('Appointment')
    fireEvent.change(titleField(), { target: { value: 'Call Kari' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add notification' }))
    expect(screen.getAllByLabelText('How')).toHaveLength(2)

    // Two days before, at four in the afternoon.
    fireEvent.change(screen.getAllByLabelText('How many')[1], { target: { value: '2' } })
    // No time of day until the notice is in days or weeks.
    expect(screen.queryByLabelText('Time of day')).not.toBeInTheDocument()
    await pick(screen.getAllByLabelText('Minutes, hours, days or weeks before')[1], 'days before')
    const at = await screen.findByLabelText('Time of day')
    expect(at).toHaveValue('09:00')
    fireEvent.change(at, { target: { value: '16:00' } })

    // The first, an hour before in the app, goes.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove notification' })[0])
    expect(screen.getAllByLabelText('How')).toHaveLength(1)

    fireEvent.click(saveButton())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking.mock.calls[0][0].notifications).toEqual([
      { channel: 'in_app', amount: 2, unit: 'days', atTime: '16:00' },
    ])
  })

  it('saves a booking with no notifications at all', async () => {
    const { onSaved } = await renderDialog()
    chooseKind('Appointment')
    fireEvent.change(titleField(), { target: { value: 'Call Kari' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove notification' }))
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking.mock.calls[0][0].notifications).toEqual([])
  })

  it('offers only the workshop channels when no customer messaging is set up', async () => {
    await renderDialog()
    fireEvent.keyDown(screen.getByLabelText('How'), { key: 'Enter' })

    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: 'In the app' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Email to me' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'SMS to customer' })).not.toBeInTheDocument()
    expect(
      within(list).queryByRole('option', { name: 'Email to customer' })
    ).not.toBeInTheDocument()
  })

  it('offers the customer channels the workshop has, once there is a customer', async () => {
    getBookingOptions.mockResolvedValue({
      success: true,
      data: { channels: ['in_app', 'email', 'customer_sms', 'customer_email'], video: [] },
    })
    const { onSaved } = await renderDialog()
    chooseKind('Appointment')
    fireEvent.change(titleField(), { target: { value: 'Call Kari' } })

    fireEvent.keyDown(screen.getByLabelText('How'), { key: 'Enter' })
    const sms = await screen.findByRole('option', { name: 'SMS to customer' })
    expect(sms).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: 'Email to customer' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    await chooseCustomer()
    await pick(screen.getByLabelText('How'), 'SMS to customer')
    expect(screen.getByLabelText('How')).toHaveTextContent('SMS to customer')
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        notifications: [{ channel: 'customer_sms', amount: 1, unit: 'hours', atTime: null }],
      })
    )
  })
})

describe('changing a booking', () => {
  it('loads the appointment and saves the change to it', async () => {
    const { onSaved } = await renderDialog({
      edit: { mode: 'edit', event: calendarEvent({}) },
    })

    expect(getBooking).toHaveBeenCalledWith({ kind: 'appointment', id: 'appt-1' })
    expect(await screen.findByDisplayValue('Call Kari')).toBeInTheDocument()
    expect(customerField()).toHaveTextContent('Kari Nordmann')
    // An appointment stays an appointment; it becomes a work order another way.
    expect(kindTab('Work order')).toBeDisabled()

    fireEvent.change(titleField(), { target: { value: 'Call Kari back' } })
    fireEvent.click(saveButton('Save'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createBooking).not.toHaveBeenCalled()
    expect(updateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'appointment',
        id: 'appt-1',
        title: 'Call Kari back',
        customerId: 'cust-1',
        startDate: '2026-11-16',
        startTime: '09:30',
        endTime: '10:30',
        notifications: [{ channel: 'in_app', amount: 1, unit: 'hours', atTime: null }],
      })
    )
    expect(toast.success).toHaveBeenCalledWith('Booking saved')
  })

  it('shows the car of a booked job but does not let it change here', async () => {
    getBooking.mockResolvedValue({
      success: true,
      data: loadedBooking({
        kind: 'workOrder',
        id: 'job-1',
        title: 'Brake job',
        vehicle: karisCar,
        work: 'Front brakes squeal',
        locked: { who: true, work: false },
      }),
    })
    await renderDialog({
      edit: {
        mode: 'edit',
        event: calendarEvent({ id: 'job-1', type: 'service', title: 'Brake job' }),
      },
    })

    expect(getBooking).toHaveBeenCalledWith({ kind: 'workOrder', id: 'job-1' })
    expect(await screen.findByDisplayValue('Brake job')).toBeInTheDocument()
    expect(vehicleField()).toHaveTextContent('2012 Volvo V70 (AB12345)')
    expect(vehicleField()).toBeDisabled()
    expect(customerField()).toBeDisabled()
    expect(
      screen.getByText('Change the car or the customer on the work order.')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Concern 1')).toHaveValue('Front brakes squeal')
    expect(kindTab('Appointment')).toBeDisabled()

    fireEvent.click(saveButton('Save'))
    await waitFor(() => expect(updateBooking).toHaveBeenCalled())
    expect(updateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workOrder',
        id: 'job-1',
        vehicleId: 'veh-1',
        work: 'Front brakes squeal',
      })
    )
  })

  it('locks the work lines once work is recorded on them', async () => {
    getBooking.mockResolvedValue({
      success: true,
      data: loadedBooking({
        kind: 'workOrder',
        id: 'job-1',
        title: 'Brake job',
        vehicle: karisCar,
        work: 'Front brakes squeal',
        locked: { who: true, work: true },
      }),
    })
    await renderDialog({
      edit: { mode: 'edit', event: calendarEvent({ id: 'job-1', type: 'service' }) },
    })

    expect(await screen.findByLabelText('Concern 1')).toBeDisabled()
    // Nothing can be added to concerns that already carry work.
    expect(screen.queryByLabelText('Add a concern and press Enter')).not.toBeInTheDocument()
    expect(
      screen.getByText('Work is recorded on these concerns. Change them on the work order.')
    ).toBeInTheDocument()
  })

  it('closes and says why when the booking cannot be loaded', async () => {
    getBooking.mockResolvedValue({
      success: false,
      error: 'The job has started. Change it on the work order.',
    })
    const { onOpenChange } = await renderDialog({
      edit: { mode: 'edit', event: calendarEvent({ id: 'job-1', type: 'service' }) },
    })

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.error).toHaveBeenCalledWith('The job has started. Change it on the work order.')
  })
})

describe('making an appointment a work order', () => {
  it('opens on a work order with the appointment, and books it from the appointment', async () => {
    createBooking.mockResolvedValue({
      success: true,
      data: {
        kind: 'workOrder',
        id: 'job-1',
        ref: '2026-1044',
        vehicleId: null,
        overbooked: false,
      },
    })
    const { onSaved } = await renderDialog({
      edit: { mode: 'convert', event: calendarEvent({}) },
    })

    expect(await screen.findByDisplayValue('Call Kari')).toBeInTheDocument()
    expect(kindTab('Work order')).toHaveAttribute('aria-selected', 'true')
    expect(kindTab('Appointment')).toBeDisabled()
    // No concerns yet: the appointment's title becomes the job's concern unless some are added.
    expect(screen.queryByLabelText('Concern 1')).not.toBeInTheDocument()
    expect(screen.getByText("Left empty, the title is the job's concern.")).toBeInTheDocument()

    fireEvent.click(saveButton('Make work order'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateBooking).not.toHaveBeenCalled()
    const sent = createBooking.mock.calls[0][0]
    expect(sent).toMatchObject({
      kind: 'workOrder',
      fromAppointmentId: 'appt-1',
      title: 'Call Kari',
      customerId: 'cust-1',
      startDate: '2026-11-16',
      startTime: '09:30',
    })
    expect(sent.id).toBeUndefined()
  })
})
