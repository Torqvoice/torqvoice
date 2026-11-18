/**
 * Following a link to an appointment opens its card, and following the same
 * link again (from the search palette, while the calendar is open and the
 * card was closed) opens it again. A card is not opened under a dialog that
 * is still closing, which would take the focus and shut it at once.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/features/scheduled-messages/Actions/scheduledMessageActions', () => ({
  deleteScheduledMessage: vi.fn(),
}))
vi.mock('@/features/calendar/Actions/deleteAppointment', () => ({ deleteAppointment: vi.fn() }))
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  toggleReminder: vi.fn(),
  deleteReminder: vi.fn(),
}))
vi.mock('@/features/calendar/Components/useDayFormatter', () => ({
  useDayFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', options).format(date),
  }),
}))

import { EventPeekProvider } from '@/features/calendar/Components/EventPeek'
import { LinkedAppointment } from '@/features/calendar/Components/LinkedAppointment'

const event: CalendarEvent = {
  id: 'appt-a',
  title: 'Talk about winter tyres',
  date: '2026-11-24',
  time: '10:30',
  endTime: '11:00',
  type: 'appointment',
  status: 'booked',
  vehicleId: 'car-1',
  vehicleLabel: '2012 Volvo V70',
  customerName: 'Test Testesen',
  invoiceNumber: null,
  amount: null,
}

function Calendar({ token, dialog = false }: { token: string; dialog?: boolean }) {
  return (
    <EventPeekProvider currencyCode="NOK">
      {dialog && <div role="dialog">Search</div>}
      <LinkedAppointment key={token} event={event} view="day" date="2026-11-24" />
    </EventPeekProvider>
  )
}

const card = () =>
  screen.queryByRole('heading', { name: 'Talk about winter tyres' }) ??
  screen.queryByText('Talk about winter tyres')

beforeEach(() => {
  window.history.replaceState(null, '', '/calendar?appointment=appt-a')
})

describe('LinkedAppointment', () => {
  it('opens the card and takes the link out of the address', async () => {
    render(<Calendar token="one" />)
    await waitFor(() => expect(card()).toBeInTheDocument())
    expect(window.location.search).toBe('?view=day&date=2026-11-24')
  })

  it('opens the card again when the same link is followed again', async () => {
    const { rerender } = render(<Calendar token="one" />)
    await waitFor(() => expect(card()).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(card()).not.toBeInTheDocument())

    rerender(<Calendar token="two" />)
    await waitFor(() => expect(card()).toBeInTheDocument())
  })

  it('waits for a closing dialog before opening the card', async () => {
    const { rerender } = render(<Calendar token="one" dialog />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(card()).not.toBeInTheDocument()

    rerender(<Calendar token="one" />)
    await waitFor(() => expect(card()).toBeInTheDocument())
  })
})
