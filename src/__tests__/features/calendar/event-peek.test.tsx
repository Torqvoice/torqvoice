import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CalendarEvent } from '@/features/calendar/Actions/calendarActions'

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'MMM d, yyyy',
    timeFormat: '24h',
    timezone: '',
    weekStartDay: 1,
  }),
}))
vi.mock('@/components/currency-settings-context', () => ({
  useFormatCurrency: () => (amount: number, code: string) => `${amount} ${code}`,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/features/scheduled-messages/Actions/scheduledMessageActions', () => ({
  deleteScheduledMessage: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  toggleReminder: vi.fn(),
  deleteReminder: vi.fn(),
}))
vi.mock('@/features/calendar/Actions/deleteAppointment', () => ({ deleteAppointment: vi.fn() }))
// The global next-intl mock has no useFormatter; the calendar's own wrapper
// is what the components import, so give it a plain Intl formatter.
vi.mock('@/features/calendar/Components/useDayFormatter', () => ({
  useDayFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', options).format(date),
  }),
}))

import { CalendarDayCell } from '@/features/calendar/Components/CalendarDayCell'
import { EventChip } from '@/features/calendar/Components/EventChip'
import { type BookingEdit, EventPeekProvider } from '@/features/calendar/Components/EventPeek'

beforeAll(() => {
  // jsdom has no ResizeObserver; the day cell and Radix popovers need one.
  class RO {
    observe() {
      return undefined
    }
    unobserve() {
      return undefined
    }
    disconnect() {
      return undefined
    }
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
  // jsdom lays nothing out; a day with no height folds every chip into "more".
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 200,
  })
})

const bookedJob: CalendarEvent = {
  id: 'job-1',
  title: 'Brake job',
  date: '2026-09-03',
  time: '09:00',
  endTime: '10:00',
  type: 'service',
  status: 'scheduled',
  vehicleId: 'v1',
  vehicleLabel: '2019 Volvo V90',
  customerName: 'Kari Nordmann',
  invoiceNumber: '2026-1001',
  amount: null,
  conditions: ['Front brakes squeal when cold', 'Oil service'],
}

const startedJob: CalendarEvent = { ...bookedJob, id: 'job-2', title: 'Clutch', status: 'pending' }

const appointment: CalendarEvent = {
  id: 'appt-1',
  title: 'Tyre quote talk',
  date: '2026-09-03',
  time: '11:00',
  endTime: '11:30',
  type: 'appointment',
  status: 'booked',
  vehicleId: null,
  vehicleLabel: '',
  customerName: 'Kari Nordmann',
  invoiceNumber: null,
  amount: null,
  description: '<p>Wants winter tyres</p>',
}

const onEditBooking = vi.fn<(edit: BookingEdit) => void>()
const onOpenDay = vi.fn()
const onSelect = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function Month({
  events,
  showing = 'month:2026-09-03',
}: {
  events: CalendarEvent[]
  showing?: string
}) {
  return (
    <EventPeekProvider currencyCode="NOK" onEditBooking={onEditBooking} showing={showing}>
      <CalendarDayCell
        date={new Date(2026, 8, 3)}
        dateStr="2026-09-03"
        events={events}
        isCurrentMonth
        isToday={false}
        isSelected={false}
        isWeekend={false}
        actions={{
          onNewWorkOrder: vi.fn(),
          onBookAppointment: vi.fn(),
          onNewReminder: vi.fn(),
          onNewQuote: vi.fn(),
          onScheduleMessage: vi.fn(),
        }}
        onSelect={onSelect}
        onOpenDay={onOpenDay}
      />
    </EventPeekProvider>
  )
}

const chip = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

/** A double-click as the browser sends it: two clicks, then the double-click. */
async function doubleClick(el: HTMLElement) {
  press(el, 1)
  // The card listens for a press outside it from the next tick on.
  await new Promise((resolve) => setTimeout(resolve, 20))
  press(el, 2)
  fireEvent.doubleClick(el, { detail: 2 })
}

/** One press of the mouse button, with everything the browser sends for it. */
function press(el: HTMLElement, detail: number) {
  fireEvent.pointerDown(el, { detail, button: 0 })
  fireEvent.mouseDown(el, { detail, button: 0 })
  fireEvent.pointerUp(el, { detail, button: 0 })
  fireEvent.mouseUp(el, { detail, button: 0 })
  fireEvent.click(el, { detail })
}

describe('the card a click on an event opens', () => {
  it("shows a job's conditions where an appointment shows its description", async () => {
    render(<Month events={[bookedJob, appointment]} />)

    fireEvent.click(chip('Brake job'))
    expect(await screen.findByText('Front brakes squeal when cold')).toBeInTheDocument()
    expect(screen.getByText('Oil service')).toBeInTheDocument()

    fireEvent.click(chip('Tyre quote talk'))
    expect(await screen.findByText('Wants winter tyres')).toBeInTheDocument()
  })

  it('still shows the description an older job carries, after its conditions', async () => {
    render(
      <Month
        events={[
          {
            ...bookedJob,
            conditions: ['Brakes'],
            description: '<p>Customer waits in reception</p>',
          },
        ]}
      />
    )

    fireEvent.click(chip('Brake job'))

    expect(await screen.findByText('Brakes')).toBeInTheDocument()
    expect(screen.getByText('Customer waits in reception')).toBeInTheDocument()
  })

  it('closes when the calendar moves to another view or day', async () => {
    const { rerender } = render(<Month events={[bookedJob]} />)
    fireEvent.click(chip('Brake job'))
    expect(await screen.findByText('Oil service')).toBeInTheDocument()

    rerender(<Month events={[bookedJob]} showing="day:2026-09-03" />)

    await waitFor(() => expect(screen.queryByText('Oil service')).not.toBeInTheDocument())
  })

  it('stays open while the calendar is redrawn on the same view and day', async () => {
    const { rerender } = render(<Month events={[bookedJob]} />)
    fireEvent.click(chip('Brake job'))
    expect(await screen.findByText('Oil service')).toBeInTheDocument()

    rerender(<Month events={[bookedJob]} />)

    expect(screen.getByText('Oil service')).toBeInTheDocument()
  })
})

describe('a double-click in the month', () => {
  it('opens a booking for editing and leaves the view alone', async () => {
    render(<Month events={[bookedJob, appointment]} />)

    await doubleClick(chip('Brake job'))

    expect(onEditBooking).toHaveBeenCalledTimes(1)
    expect(onEditBooking).toHaveBeenCalledWith({ mode: 'edit', event: bookedJob })
    expect(onOpenDay).not.toHaveBeenCalled()
    // The card the first click opened is gone: the dialog took its place.
    expect(screen.queryByText('Oil service')).not.toBeInTheDocument()

    await doubleClick(chip('Tyre quote talk'))
    expect(onEditBooking).toHaveBeenLastCalledWith({ mode: 'edit', event: appointment })
    expect(onOpenDay).not.toHaveBeenCalled()
  })

  it('leaves the card open on a job that is changed on the work order, and the view alone', async () => {
    render(<Month events={[startedJob]} />)

    await doubleClick(chip('Clutch'))

    expect(onEditBooking).not.toHaveBeenCalled()
    expect(onOpenDay).not.toHaveBeenCalled()
    expect(await screen.findByRole('link', { name: /Open work order/ })).toBeInTheDocument()
  })

  it('closes the card on a second, separate click on the same item', async () => {
    render(<Month events={[startedJob]} />)

    press(chip('Clutch'), 1)
    expect(await screen.findByRole('link', { name: /Open work order/ })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    press(chip('Clutch'), 1)

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Open work order/ })).not.toBeInTheDocument()
    )
  })

  it('still opens the day on the empty part of a day', () => {
    render(<Month events={[bookedJob]} />)

    fireEvent.doubleClick(screen.getByRole('gridcell'))

    expect(onOpenDay).toHaveBeenCalledTimes(1)
    expect(onEditBooking).not.toHaveBeenCalled()
  })
})

describe('a double-click on the time grid and in a list', () => {
  it.each([
    'block',
    'row',
    'chip',
  ] as const)('opens a booking for editing from a %s', async (variant) => {
    render(
      <EventPeekProvider currencyCode="NOK" onEditBooking={onEditBooking}>
        <EventChip event={bookedJob} variant={variant} />
      </EventPeekProvider>
    )

    await doubleClick(chip('Brake job'))

    expect(onEditBooking).toHaveBeenCalledWith({ mode: 'edit', event: bookedJob })
  })
})
