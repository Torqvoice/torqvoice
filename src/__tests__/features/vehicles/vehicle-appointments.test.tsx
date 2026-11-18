/**
 * The vehicle page answers "is this car booked?": its appointments in the
 * rail, the coming ones first, each opening the calendar on that booking.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'MMM d, yyyy',
    timeFormat: '24h',
    timezone: 'Europe/Oslo',
    weekStartDay: 1,
  }),
}))

import { VehicleAppointments } from '@/features/vehicles/Components/VehicleAppointments'

const upcoming = {
  id: 'appt-next',
  title: 'Talk about winter tyres',
  startAt: '2026-11-24T09:30:00Z',
  date: '2026-11-24',
  time: '10:30',
  upcoming: true,
}
const past = {
  id: 'appt-past',
  title: 'Test drive after repair',
  startAt: '2026-11-10T13:00:00Z',
  date: '2026-11-10',
  time: '14:00',
  upcoming: false,
}

describe('VehicleAppointments', () => {
  it('lists coming appointments with their day and time, linked to the calendar', () => {
    render(<VehicleAppointments appointments={[upcoming, past]} />)

    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeInTheDocument()
    const next = screen.getByRole('link', { name: /Talk about winter tyres/ })
    expect(next).toHaveAttribute('href', '/calendar?appointment=appt-next')
    expect(next).toHaveTextContent('Nov 24, 2026 · 10:30')
    expect(screen.queryByText('Nothing booked ahead')).not.toBeInTheDocument()
  })

  it('shows past appointments after the coming ones, under Earlier', () => {
    render(<VehicleAppointments appointments={[upcoming, past]} />)

    const links = screen.getAllByRole('link').map((l) => l.textContent)
    expect(links[0]).toContain('Talk about winter tyres')
    expect(links[1]).toContain('Test drive after repair')
    const earlier = screen.getByText('Earlier')
    const pastList = earlier.nextElementSibling as HTMLElement
    expect(within(pastList).getByRole('link')).toHaveAttribute(
      'href',
      '/calendar?appointment=appt-past'
    )
  })

  it('says nothing is booked ahead when only past appointments remain', () => {
    render(<VehicleAppointments appointments={[past]} />)
    expect(screen.getByText('Nothing booked ahead')).toBeInTheDocument()
  })

  it('leaves the section out for a car with no appointments', () => {
    const { container } = render(<VehicleAppointments appointments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
