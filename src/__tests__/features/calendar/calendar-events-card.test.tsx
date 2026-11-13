import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/features/scheduled-messages/Actions/scheduledMessageActions', () => ({
  deleteScheduledMessage: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  toggleReminder: vi.fn(),
  deleteReminder: vi.fn(),
}))
// The booking form talks to the server; what matters here is that the card
// opens it, on the day the card starts.
vi.mock('@/features/calendar/Components/BookAppointmentDialog', () => ({
  BookAppointmentDialog: ({ open, defaultDate }: { open: boolean; defaultDate?: string }) =>
    open ? <div role="dialog">Booking for {defaultDate}</div> : null,
}))
vi.mock('@/features/calendar/Components/useDayFormatter', () => ({
  useDayFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', options).format(date),
  }),
}))

import { CalendarEventsCard } from '@/features/calendar/Components/CalendarEventsCard'

const TODAY = '2026-11-16'

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title'>) {
  return {
    date: TODAY,
    time: null,
    type: 'service',
    status: 'scheduled',
    vehicleId: 'car-1',
    vehicleLabel: '2012 Volvo V70',
    customerName: 'Kari Nordmann',
    invoiceNumber: null,
    amount: null,
    ...partial,
  } as CalendarEvent
}

function renderCard(events: CalendarEvent[]) {
  return render(<CalendarEventsCard events={events} todayKey={TODAY} days={7} currencyCode="NOK" />)
}

beforeEach(() => {
  push.mockReset()
})

describe('calendar events card', () => {
  it('lists what is coming, day by day, and leaves out what is done', () => {
    renderCard([
      event({ id: 'job-1', title: 'Brake service', time: '09:30' }),
      event({ id: 'job-2', title: 'Oil change', status: 'completed', time: '08:00' }),
      event({
        id: 'rem-1',
        title: 'Call about tyres',
        type: 'reminder',
        status: 'upcoming',
        date: '2026-11-18',
      }),
      event({
        id: 'closure:0:2026-11-20',
        title: 'Workshop closed',
        type: 'closure',
        status: 'closed',
        date: '2026-11-20',
        vehicleId: null,
        vehicleLabel: '',
        customerName: null,
      }),
    ])

    expect(screen.getByText('Calendar Events')).toBeInTheDocument()
    expect(screen.getByText('Next 7 days')).toBeInTheDocument()
    expect(screen.getByText('Brake service')).toBeInTheDocument()
    expect(screen.getByText('09:30')).toBeInTheDocument()
    expect(screen.getByText('Call about tyres')).toBeInTheDocument()
    expect(screen.getByText('Workshop closed')).toBeInTheDocument()
    expect(screen.queryByText('Oil change')).not.toBeInTheDocument()

    // Three days have something on them: the 16th, 18th and 20th.
    const days = screen.getAllByRole('button', { name: /^(16|18|20)/ })
    expect(days.map((d) => d.textContent?.slice(0, 2))).toEqual(['16', '18', '20'])
  })

  it('opens the calendar on a day, and on the whole schedule', () => {
    renderCard([event({ id: 'job-1', title: 'Brake service', time: '09:30' })])

    fireEvent.click(screen.getByRole('button', { name: /^16/ }))
    expect(push).toHaveBeenCalledWith('/calendar?view=day&date=2026-11-16')

    fireEvent.click(screen.getByRole('button', { name: 'View All' }))
    expect(push).toHaveBeenCalledWith('/calendar?view=schedule')
  })

  it('books an appointment from the card', () => {
    renderCard([event({ id: 'job-1', title: 'Brake service' })])

    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }))
    expect(within(screen.getByRole('dialog')).getByText(`Booking for ${TODAY}`)).toBeInTheDocument()
  })

  it('says when nothing is coming and still offers a booking', () => {
    renderCard([event({ id: 'job-2', title: 'Oil change', status: 'completed' })])

    expect(screen.getByText('Nothing on the calendar in the next 7 days.')).toBeInTheDocument()
    expect(screen.queryByText('Oil change')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View All' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
