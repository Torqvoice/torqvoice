/**
 * Opening hours on the customer portal: the week, and the days soon the
 * workshop is shut or closes early, so a customer can plan a visit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/lib/db', () => ({
  db: { appSetting: { findFirst: vi.fn() } },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Australia/Sydney'),
}))
vi.mock('@/features/workshop-calendar/Lib/loadCalendar.server', () => ({
  loadWorkshopCalendar: vi.fn(),
}))

import { db } from '@/lib/db'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import {
  getPortalOpeningHours,
  type PortalOpeningHours as Hours,
} from '@/features/portal/Actions/portalActions'
import { PortalOpeningHours } from '@/features/portal/Components/PortalOpeningHours'

const holiday = (name: string, date: string, startTime?: string) => ({
  name,
  source: 'holiday' as const,
  startDate: date,
  endDate: date,
  ...(startTime ? { startTime } : {}),
})

describe('what the portal is told', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Monday 21 December 2026, mid-morning in Sydney.
    vi.setSystemTime(new Date('2026-12-20T23:00:00Z'))
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({ value: '24h' } as never)
    vi.mocked(loadWorkshopCalendar).mockResolvedValue({
      enabled: true,
      calendar: {
        timeZone: 'Australia/Sydney',
        week: defaultWeek('08:00', '17:00'),
        closures: [
          holiday('Christmas Eve', '2026-12-24', '12:00'),
          holiday('Christmas Day', '2026-12-25'),
          // A Saturday and a Sunday: shut anyway, so nothing to tell anyone.
          holiday('Boxing Day', '2026-12-26'),
          holiday('Sunday market', '2026-12-27'),
          holiday('Boxing Day (observed)', '2026-12-28'),
        ],
        absences: [],
      },
    })
  })

  it('sends the week, the workshop clock and the days it shuts or closes early', async () => {
    const res = await getPortalOpeningHours()
    expect(res.success).toBe(true)
    const hours = res.data as Hours
    expect(hours.today).toBe('2026-12-21')
    expect(hours.timeFormat).toBe('24h')
    expect(hours.week[1]).toEqual({ open: true, start: '08:00', end: '17:00' })
    expect(hours.closedSoon).toEqual([
      { date: '2026-12-24', name: 'Christmas Eve', open: [{ start: '08:00', end: '12:00' }] },
      { date: '2026-12-25', name: 'Christmas Day', open: [] },
      { date: '2026-12-28', name: 'Boxing Day (observed)', open: [] },
    ])
  })
})

describe('the opening hours card', () => {
  const hours: Hours = {
    week: defaultWeek('08:00', '17:00'),
    today: '2026-12-22',
    timeFormat: '12h',
    closedSoon: [
      { date: '2026-12-24', name: 'Christmas Eve', open: [{ start: '08:00', end: '12:00' }] },
      { date: '2026-12-25', name: 'Christmas Day', open: [] },
    ],
  }

  it('lists the week from Monday, marks today and says which days are closed', () => {
    render(<PortalOpeningHours hours={hours} />)
    const days = within(screen.getByTestId('portal-opening-hours')).getAllByRole('listitem')
    expect(days.map((d) => d.textContent)).toEqual([
      'Monday8 AM – 5 PM',
      'Tuesday (Today)8 AM – 5 PM',
      'Wednesday8 AM – 5 PM',
      'Thursday8 AM – 5 PM',
      'Friday8 AM – 5 PM',
      'SaturdayClosed',
      'SundayClosed',
    ])
    expect(days[1]).toHaveAttribute('aria-current', 'date')
  })

  it('names the days soon it is shut, and the hours of a short day', () => {
    render(<PortalOpeningHours hours={hours} />)
    const soon = within(screen.getByTestId('portal-closed-soon')).getAllByRole('listitem')
    expect(soon.map((d) => d.textContent)).toEqual([
      'Thu, Dec 24 · Christmas EveOpen 8 AM – 12 PM',
      'Fri, Dec 25 · Christmas DayClosed',
    ])
  })

  it('leaves the closed-soon list out when nothing is coming up', () => {
    render(<PortalOpeningHours hours={{ ...hours, closedSoon: [] }} />)
    expect(screen.queryByTestId('portal-closed-soon')).not.toBeInTheDocument()
  })
})
