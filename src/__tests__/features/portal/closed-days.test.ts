/**
 * A customer asking for service on a day the workshop is closed.
 *
 * The request is refused with the reason, before a vehicle or a request is
 * created, and the form can list the closed days ahead so they are not picked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    vehicle: { findFirst: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn() },
    serviceRequest: { create: vi.fn() },
  },
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
// The server's translations, from the real English messages.
vi.mock('next-intl/server', async () => {
  const messages = (await import('../../../../messages/en/workshopCalendar.json')).default
  return {
    getTranslations:
      async (namespace: string) => (key: string, values?: Record<string, string>) => {
        const path = [...namespace.split('.').slice(1), ...key.split('.')]
        let text: unknown = messages
        for (const part of path) text = (text as Record<string, unknown>)[part]
        return String(text).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? '')
      },
  }
})

import { db } from '@/lib/db'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import { createServiceRequest } from '@/features/portal/Actions/portalActions'

const calendar = {
  timeZone: 'Australia/Sydney',
  week: defaultWeek('08:00', '17:00'),
  closures: [
    {
      name: 'Australia Day',
      source: 'holiday' as const,
      startDate: '2027-01-26',
      endDate: '2027-01-26',
    },
  ],
  absences: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadWorkshopCalendar).mockResolvedValue({ enabled: true, calendar })
})

describe('asking for service on a closed day', () => {
  it('is refused with the holiday named, before anything is created', async () => {
    const res = await createServiceRequest({
      vehicleId: 'v1',
      description: 'Brakes squeal',
      preferredDate: '2027-01-26',
    })
    expect(res).toEqual({
      success: false,
      error: 'The workshop is closed on that day (Australia Day). Please pick another day.',
    })
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
    expect(db.serviceRequest.create).not.toHaveBeenCalled()
  })

  it('is refused when the closed day comes with a time of day', async () => {
    const res = await createServiceRequest({
      vehicleId: 'v1',
      description: 'Brakes squeal',
      preferredDate: '2027-01-26T12:00',
    })
    expect(res).toEqual({
      success: false,
      error: 'The workshop is closed on that day (Australia Day). Please pick another day.',
    })
    expect(db.serviceRequest.create).not.toHaveBeenCalled()
  })

  it('is refused on a weekday the workshop never opens', async () => {
    const res = await createServiceRequest({
      vehicleId: 'v1',
      description: 'Service',
      preferredDate: '2027-01-24', // a Sunday
    })
    expect(res).toEqual({
      success: false,
      error: 'The workshop is closed on that day. Please pick another day.',
    })
  })

  it('goes through on an open day', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)
    const res = await createServiceRequest({
      vehicleId: 'v1',
      description: 'Service',
      preferredDate: '2027-01-25',
    })
    // Past the closed-day check, the usual vehicle check answers.
    expect(res).toEqual({ success: false, error: 'Vehicle not found' })
    expect(db.vehicle.findFirst).toHaveBeenCalled()
  })
})
