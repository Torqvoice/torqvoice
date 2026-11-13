/**
 * What the calendar lists for one person: jobs for whoever may open the
 * calendar, and quotes, reminders and scheduled messages only for a role that
 * may read those records on their own pages. The dashboard's calendar card
 * reads the same feed, so this is what both screens show.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (key: string) => key
    t.has = () => false
    return t
  },
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Europe/Oslo'),
}))
vi.mock('@/features/workshop-calendar/Lib/loadCalendar.server', () => ({
  loadWorkshopCalendar: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    reminder: { findMany: vi.fn() },
    quote: { findMany: vi.fn() },
    scheduledMessage: { findMany: vi.fn() },
    externalCalendarEvent: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    technician: { findMany: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { getCalendarEvents } from '@/features/calendar/Actions/calendarActions'

const ORG = 'org-a'
const MONDAY = new Date('2026-11-16T09:00:00Z')

function signInAs(role: 'owner' | 'member', permissions: { action: string; subject: string }[]) {
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role,
    roleId: role === 'member' ? 'role-1' : null,
    customRole: role === 'member' ? { isAdmin: false, permissions } : null,
  } as never)
}

const read = (subject: string) => ({ action: 'read', subject })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@x.com' },
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.auditLog.create).mockResolvedValue({} as never)
  vi.mocked(loadWorkshopCalendar).mockResolvedValue({
    calendar: {
      closures: [
        {
          name: 'Workshop closed',
          startDate: '2026-11-17',
          endDate: '2026-11-17',
          startTime: null,
          endTime: null,
          source: 'own',
        },
      ],
      absences: [],
    },
  } as never)
  vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
    {
      id: 'job-1',
      title: 'Brake service',
      serviceDate: MONDAY,
      startDateTime: MONDAY,
      endDateTime: null,
      status: 'scheduled',
      invoiceNumber: null,
      totalAmount: 0,
      cost: 0,
      vehicleId: 'car-1',
      customer: { name: 'Kari' },
      vehicle: { make: 'Volvo', model: 'V70', year: 2012, customer: null },
      _count: { appointmentNotifications: 0 },
    },
  ] as never)
  vi.mocked(db.reminder.findMany).mockResolvedValue([
    {
      id: 'rem-1',
      title: 'Call about tyres',
      dueDate: MONDAY,
      hasDueTime: false,
      isCompleted: false,
      vehicleId: 'car-1',
      customer: null,
      vehicle: { make: 'Volvo', model: 'V70', year: 2012, customer: { name: 'Kari' } },
    },
  ] as never)
  vi.mocked(db.quote.findMany).mockResolvedValue([
    {
      id: 'quote-1',
      title: 'Timing belt',
      quoteNumber: 'Q-1',
      validUntil: MONDAY,
      status: 'sent',
      totalAmount: 9000,
      vehicleId: 'car-1',
      vehicle: { make: 'Volvo', model: 'V70', year: 2012, customer: { name: 'Kari' } },
      customer: null,
    },
  ] as never)
  vi.mocked(db.scheduledMessage.findMany).mockResolvedValue([
    {
      id: 'msg-1',
      channel: 'sms',
      subject: 'Your car is booked in',
      body: 'See you Monday',
      recipient: '+4799999999',
      status: 'scheduled',
      sendAt: MONDAY,
      vehicleId: 'car-1',
      customer: { name: 'Kari' },
      vehicle: { make: 'Volvo', model: 'V70', year: 2012 },
    },
  ] as never)
  vi.mocked(db.externalCalendarEvent.findMany).mockResolvedValue([])
  vi.mocked(db.appointment.findMany).mockResolvedValue([
    {
      id: 'appt-1',
      title: 'Tyre quote talk',
      description: '<p>Wants winter tyres</p><script>x()</script>',
      startAt: MONDAY,
      endAt: new Date(MONDAY.getTime() + 30 * 60_000),
      vehicleId: null,
      customer: { name: 'Kari' },
      vehicle: null,
      _count: { notifications: 1 },
    },
  ] as never)
  vi.mocked(db.technician.findMany).mockResolvedValue([])
})

async function titles() {
  const res = await getCalendarEvents({ start: '2026-11-16', end: '2026-11-22' })
  expect(res.success).toBe(true)
  return (res.data ?? []).map((e) => `${e.type}: ${e.title}`).sort()
}

describe('calendar events by role', () => {
  it('shows an owner everything on the calendar', async () => {
    signInAs('owner', [])
    expect(await titles()).toEqual([
      'appointment: Tyre quote talk',
      'closure: Workshop closed',
      'message: Your car is booked in',
      'quote: Timing belt',
      'reminder: Call about tyres',
      'service: Brake service',
    ])
  })

  it('shows a role that reads jobs only the jobs and the workshop days', async () => {
    signInAs('member', [read('services')])
    expect(await titles()).toEqual([
      'appointment: Tyre quote talk',
      'closure: Workshop closed',
      'service: Brake service',
    ])
    // Not fetched and dropped: never asked for.
    expect(db.quote.findMany).not.toHaveBeenCalled()
    expect(db.reminder.findMany).not.toHaveBeenCalled()
    expect(db.scheduledMessage.findMany).not.toHaveBeenCalled()
  })

  it('adds each kind of record the role may read', async () => {
    signInAs('member', [read('services'), read('quotes'), read('vehicles')])
    expect(await titles()).toEqual([
      'appointment: Tyre quote talk',
      'closure: Workshop closed',
      'quote: Timing belt',
      'reminder: Call about tyres',
      'service: Brake service',
    ])
  })

  it('shows scheduled messages to a role that reads customers', async () => {
    signInAs('member', [read('services'), read('customers')])
    expect(await titles()).toContain('message: Your car is booked in')
  })

  it('lists appointments with their description cleaned', async () => {
    signInAs('owner', [])
    const res = await getCalendarEvents({ start: '2026-11-16', end: '2026-11-22' })
    const appointment = res.data?.find((e) => e.type === 'appointment')
    expect(appointment).toMatchObject({
      title: 'Tyre quote talk',
      date: '2026-11-16',
      time: '10:00',
      endTime: '10:30',
      customerName: 'Kari',
      notificationCount: 1,
    })
    expect(appointment?.description).toContain('Wants winter tyres')
    expect(appointment?.description).not.toContain('script')
  })

  it('refuses the calendar to a role that cannot read jobs', async () => {
    signInAs('member', [read('quotes'), read('vehicles'), read('customers')])
    const res = await getCalendarEvents({ start: '2026-11-16', end: '2026-11-22' })
    expect(res.success).toBe(false)
    expect(res.forbidden).toBe(true)
  })
})
