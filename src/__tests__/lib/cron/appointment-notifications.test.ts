/**
 * The minute-by-minute run that sends the notifications set on appointments
 * and booked jobs: each goes out once, at its minute, through the channel
 * chosen, and one that fails does not hold up the rest.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The run builds its texts with next-intl's own translator, which the global
// test mock leaves out.
vi.mock('next-intl', async (importOriginal) => importOriginal())
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Europe/Oslo' }))
vi.mock('@/i18n/locale-from-request', () => ({ resolveDocumentLocale: async () => 'en' }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendOrgMail: vi.fn(), getOrgFromAddress: vi.fn() }))
vi.mock('@/features/scheduled-messages/Lib/dispatchScheduledMessage', () => ({
  dispatchScheduledMessage: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    appointmentNotification: { findMany: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    appSetting: { findUnique: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { dispatchScheduledMessage } from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'
import { processDueAppointmentNotifications } from '@/lib/cron/appointment-notifications'

const ORG = 'org-1'
/** Monday 16 November 2026, 09:30 in Oslo. */
const START = new Date('2026-11-16T08:30:00Z')
/** An hour before it. */
const HOUR_BEFORE = new Date('2026-11-16T07:30:00Z')

type Row = Record<string, unknown> & { id: string; sentForStart: Date | null }

function appointmentRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'n-1',
    channel: 'in_app',
    amount: 1,
    unit: 'hours',
    atTime: null,
    sentForStart: null,
    updatedAt: new Date('2026-11-10T12:00:00Z'),
    organizationId: ORG,
    user: { email: 'kari@shop.example' },
    appointment: {
      id: 'appt-1',
      title: 'Brake check',
      startAt: START,
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      customer: { name: 'Ola Nordmann' },
      vehicle: { year: 2012, make: 'Volvo', model: 'V70', licensePlate: 'AB12345' },
    },
    serviceRecord: null,
    ...overrides,
  }
}

function jobRow(overrides: Partial<Row> = {}): Row {
  return {
    ...appointmentRow(),
    id: 'n-job',
    appointment: null,
    serviceRecord: {
      id: 'job-1',
      title: 'Timing belt',
      startDateTime: START,
      invoiceNumber: '2026-1044',
      customerId: null,
      vehicleId: 'veh-1',
      customer: null,
      vehicle: {
        year: 2012,
        make: 'Volvo',
        model: 'V70',
        licensePlate: 'AB12345',
        customerId: 'cust-1',
        customer: { name: 'Ola Nordmann' },
      },
    },
    ...overrides,
  }
}

/**
 * The notifications table as the run sees it: read each minute, and a claim
 * stamps the start it went out for, as the database would.
 */
function table(rows: Row[]) {
  vi.mocked(db.appointmentNotification.findMany).mockImplementation((async () =>
    rows.map((r) => ({ ...r }))) as never)
  vi.mocked(db.appointmentNotification.updateMany).mockImplementation((async (args: {
    where: { id: string }
    data: { sentForStart: Date }
  }) => {
    const row = rows.find((r) => r.id === args.where.id)
    if (!row || row.sentForStart?.getTime() === args.data.sentForStart.getTime()) {
      return { count: 0 }
    }
    row.sentForStart = args.data.sentForStart
    return { count: 1 }
  }) as never)
  return rows
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Test Shop' } as never)
  // No time format chosen: the 12-hour clock.
  vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
  vi.mocked(getOrgFromAddress).mockResolvedValue('Test Shop <shop@example.com>')
  // A failing send is logged; keep the test output quiet.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('a notification in the app', () => {
  it('goes out an hour before, once, and is marked sent for that start', async () => {
    const rows = table([appointmentRow()])

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        type: 'appointment.due',
        title: 'Coming up: Brake check',
        entityType: 'Appointment',
        entityId: 'appt-1',
        entityUrl: '/calendar?view=day&date=2026-11-16',
      })
    )
    const message = vi.mocked(notify).mock.calls[0][0].message
    expect(message).toContain('Ola Nordmann')
    expect(message).toContain('2012 Volvo V70 (AB12345)')
    expect(db.appointmentNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', OR: [{ sentForStart: null }, { sentForStart: { not: START } }] },
      data: { sentForStart: START },
    })
    expect(rows[0].sentForStart).toEqual(START)

    // The next run in the same minute finds it already sent.
    const again = await processDueAppointmentNotifications(new Date(HOUR_BEFORE.getTime() + 30_000))
    expect(again).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("says when on the workshop's own clock, 12-hour unless it chose 24-hour", async () => {
    table([appointmentRow()])
    await processDueAppointmentNotifications(HOUR_BEFORE)
    expect(vi.mocked(notify).mock.calls[0][0].message).toContain('Monday, November 16 at 09:30 AM')

    vi.mocked(notify).mockClear()
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: '24h' } as never)
    table([appointmentRow()])
    await processDueAppointmentNotifications(HOUR_BEFORE)
    const message = vi.mocked(notify).mock.calls[0][0].message
    expect(message).toContain('Monday, November 16 at 09:30')
    expect(message).not.toContain('AM')
    expect(db.appSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_key: { organizationId: ORG, key: 'workshop.timeFormat' } },
      })
    )
  })

  it('sends nothing when another server claimed it first', async () => {
    vi.mocked(db.appointmentNotification.findMany).mockResolvedValue([appointmentRow()] as never)
    vi.mocked(db.appointmentNotification.updateMany).mockResolvedValue({ count: 0 } as never)

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('waits until its minute comes', async () => {
    table([appointmentRow()])

    const sent = await processDueAppointmentNotifications(new Date('2026-11-16T07:29:00Z'))

    expect(sent).toBe(0)
    expect(notify).not.toHaveBeenCalled()
    expect(db.appointmentNotification.updateMany).not.toHaveBeenCalled()
  })

  it('is not sent once the appointment has started', async () => {
    table([appointmentRow()])

    const sent = await processDueAppointmentNotifications(new Date('2026-11-16T08:31:00Z'))

    expect(sent).toBe(0)
    expect(notify).not.toHaveBeenCalled()
    expect(db.appointmentNotification.updateMany).not.toHaveBeenCalled()
  })
})

describe('an email notification', () => {
  it('goes to whoever set it, with the title made safe for HTML', async () => {
    table([
      appointmentRow({
        channel: 'email',
        appointment: {
          ...(appointmentRow().appointment as Record<string, unknown>),
          title: 'Brakes <b>& pads</b>',
        },
      }),
    ])

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(1)
    expect(sendOrgMail).toHaveBeenCalledTimes(1)
    const [org, mail] = vi.mocked(sendOrgMail).mock.calls[0]
    expect(org).toBe(ORG)
    expect(mail).toMatchObject({ from: 'Test Shop <shop@example.com>', to: 'kari@shop.example' })
    expect(mail.subject).toMatch(/^Coming up: Brakes <b>& pads<\/b>, Monday/)
    expect(mail.html).toContain('Brakes &lt;b&gt;&amp; pads&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>&')
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('a notification to the customer', () => {
  it("goes out by SMS through the workshop's own messaging, to the appointment's customer", async () => {
    table([appointmentRow({ channel: 'customer_sms' })])

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(1)
    expect(dispatchScheduledMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'sms',
        organizationId: ORG,
        customerId: 'cust-1',
        vehicleId: 'veh-1',
        recipient: null,
      })
    )
    const { body } = vi.mocked(dispatchScheduledMessage).mock.calls[0][0]
    expect(body).toContain('Hi Ola Nordmann')
    expect(body).toContain('Test Shop')
  })

  it('logs a send that fails and carries on with the rest', async () => {
    table([
      appointmentRow({ id: 'n-sms', channel: 'customer_sms' }),
      appointmentRow({ id: 'n-bell', channel: 'in_app' }),
    ])
    vi.mocked(dispatchScheduledMessage).mockRejectedValue(new Error('SMS provider down'))

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('customer_sms for n-sms failed'),
      'SMS provider down'
    )
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

describe('a booked job', () => {
  it("goes out by the job's start, and opens the job", async () => {
    table([jobRow()])

    const now = HOUR_BEFORE
    const sent = await processDueAppointmentNotifications(now)

    expect(sent).toBe(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Coming up: Timing belt',
        entityType: 'ServiceRecord',
        entityId: 'job-1',
        entityUrl: '/vehicles/veh-1/service/job-1',
      })
    )
    // Only jobs still booked are read: once the car is in, nothing more goes out.
    const where = vi.mocked(db.appointmentNotification.findMany).mock.calls[0][0]?.where
    expect(where?.OR).toContainEqual({
      serviceRecord: {
        status: 'scheduled',
        startDateTime: { gt: now, lte: expect.any(Date) },
      },
    })
  })

  it("reaches the customer through the job's car when the job names no customer", async () => {
    table([jobRow({ channel: 'customer_email' })])

    await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(dispatchScheduledMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', customerId: 'cust-1', vehicleId: 'veh-1' })
    )
  })

  it('moves with the job: a job moved later is not due at the old time', async () => {
    const moved = jobRow()
    ;(moved.serviceRecord as { startDateTime: Date }).startDateTime = new Date(
      '2026-11-16T12:00:00Z'
    )
    table([moved])

    const sent = await processDueAppointmentNotifications(HOUR_BEFORE)

    expect(sent).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
})
