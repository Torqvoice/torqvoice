/**
 * Booking from the calendar dialog: an appointment is only on the calendar,
 * a work order books the car in as a scheduled job that holds a bay. Both
 * are read on the workshop's own clock, carry their notifications, and only
 * ever touch this workshop's rows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so a test that reloads the modules (demo mode) still sees the same mocks.
const session = vi.hoisted(() => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/cached-session', () => session)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// A plain function, so resetting the mocks cannot blank the zone.
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Europe/Oslo' }))
const loadBookingContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/workboard/Lib/bookings', () => ({ loadBookingContext }))
const bookingResources = vi.hoisted(() => vi.fn())
vi.mock('@/features/inspection-reminders/Lib/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/inspection-reminders/Lib/booking')>()),
  bookingResources,
}))
const db = vi.hoisted(() => ({
  // The job number query: nothing yet in the workshop's format.
  $queryRaw: async () => [],
  user: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  vehicle: { findFirst: vi.fn() },
  customer: { findFirst: vi.fn() },
  appSetting: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  technician: { findFirst: vi.fn() },
  workBay: { findFirst: vi.fn() },
  serviceRecord: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  serviceConcern: { deleteMany: vi.fn(), createMany: vi.fn() },
  appointment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  appointmentNotification: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db }))

import { createBooking } from '@/features/calendar/Actions/createBooking'
import { updateBooking } from '@/features/calendar/Actions/updateBooking'
import { deleteAppointment } from '@/features/calendar/Actions/deleteAppointment'
import type { SaveBookingInput } from '@/features/calendar/Schema/bookingSchema'

const ORG = 'org-1'
const USER = 'user-1'

function signInAs(
  role: 'owner' | 'member' = 'owner',
  permissions: { action: string; subject: string }[] = []
) {
  session.getCachedMembership.mockResolvedValue({
    organizationId: ORG,
    role,
    roleId: role === 'member' ? 'role-1' : null,
    customRole: role === 'member' ? { isAdmin: false, permissions } : null,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  session.getCachedSession.mockResolvedValue({ user: { id: USER, email: 'office@example.com' } })
  signInAs('owner')
  db.user.findUnique.mockResolvedValue({ isSuperAdmin: false, name: 'Kari' })
  db.auditLog.create.mockResolvedValue({})
  db.appSetting.findMany.mockResolvedValue([])
  db.appSetting.findUnique.mockResolvedValue(null)
  db.organization.findUnique.mockResolvedValue({ name: 'Test Shop' })
  db.technician.findFirst.mockResolvedValue({ name: 'Tech' })
  db.workBay.findFirst.mockResolvedValue({ id: 'bay' })
  db.vehicle.findFirst.mockResolvedValue({
    id: 'veh-1',
    customerId: 'cust-1',
    customer: { taxExempt: false },
  })
  db.customer.findFirst.mockResolvedValue({ id: 'cust-1', taxExempt: false })
  // The newest numbered job, for the next job number.
  db.serviceRecord.findFirst.mockResolvedValue({ invoiceNumber: '2026-1043' })
  db.serviceRecord.create.mockResolvedValue({ id: 'job-1' })
  db.serviceRecord.update.mockResolvedValue({
    id: 'job-1',
    vehicleId: 'veh-1',
    invoiceNumber: '2026-1044',
  })
  db.appointment.create.mockResolvedValue({ id: 'appt-1', title: 'Call Kari', vehicleId: null })
  db.appointment.update.mockResolvedValue({ id: 'appt-1', title: 'Call Kari', vehicleId: null })
  db.appointment.delete.mockResolvedValue({})
  db.appointmentNotification.findMany.mockResolvedValue([])
  db.appointmentNotification.deleteMany.mockResolvedValue({ count: 0 })
  db.appointmentNotification.createMany.mockResolvedValue({ count: 0 })
  db.serviceConcern.deleteMany.mockResolvedValue({ count: 0 })
  db.serviceConcern.createMany.mockResolvedValue({ count: 0 })
  // The transaction hands the same client in, so its writes are the ones read below.
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  // A shop with nothing set up to hold, unless a test says otherwise.
  bookingResources.mockResolvedValue([])
  loadBookingContext.mockResolvedValue({ bookings: [], hours: {}, closuresEnabled: false })
})

/** Monday 16 November 2026, 09:30 to 10:30 in Oslo: 08:30 to 09:30 UTC. */
function booking(overrides: Partial<SaveBookingInput> = {}): SaveBookingInput {
  return {
    kind: 'appointment',
    title: 'Call Kari',
    startDate: '2026-11-16',
    startTime: '09:30',
    endDate: '2026-11-16',
    endTime: '10:30',
    notifications: [],
    ...overrides,
  }
}

/** Something already on the calendar on Monday, 08:00 to 10:00 UTC. */
function held(resource: { workBayId?: string; technicianId?: string }, id = 'other-job') {
  return {
    id,
    kind: 'serviceRecord' as const,
    label: 'Brakes',
    start: new Date('2026-11-16T08:00:00Z'),
    end: new Date('2026-11-16T10:00:00Z'),
    ...resource,
  }
}

const appointmentData = () => db.appointment.create.mock.calls[0][0].data
const jobData = () => db.serviceRecord.create.mock.calls[0][0].data
const jobUpdate = () => db.serviceRecord.update.mock.calls[0][0]
const createdNotifications = () => db.appointmentNotification.createMany.mock.calls[0][0].data

describe('createBooking: an appointment', () => {
  it("puts it on the workshop's clock with its title, description, customer and notifications", async () => {
    const result = await createBooking(
      booking({
        vehicleId: 'veh-1',
        description: '<p>Bring the <strong>spare key</strong></p><script>alert(1)</script>',
        notifications: [
          { channel: 'in_app', amount: 1, unit: 'hours', atTime: null },
          { channel: 'email', amount: 1, unit: 'days', atTime: '16:00' },
        ],
      })
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ kind: 'appointment', id: 'appt-1', overbooked: false })
    const data = appointmentData()
    expect(data.organizationId).toBe(ORG)
    expect(data.title).toBe('Call Kari')
    // 09:30 in Oslo in November is 08:30 UTC, whatever the server's own zone.
    expect(data.startAt).toEqual(new Date('2026-11-16T08:30:00Z'))
    expect(data.endAt).toEqual(new Date('2026-11-16T09:30:00Z'))
    expect(data.description).toContain('<p>Bring the <strong>spare key</strong></p>')
    expect(data.description).not.toContain('<script')
    // The car brings its owner.
    expect(data.vehicleId).toBe('veh-1')
    expect(data.customerId).toBe('cust-1')
    expect(db.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'veh-1', organizationId: ORG } })
    )

    expect(createdNotifications()).toEqual([
      {
        organizationId: ORG,
        userId: USER,
        appointmentId: 'appt-1',
        channel: 'in_app',
        amount: 1,
        unit: 'hours',
        atTime: null,
      },
      {
        organizationId: ORG,
        userId: USER,
        appointmentId: 'appt-1',
        channel: 'email',
        amount: 1,
        unit: 'days',
        atTime: '16:00',
      },
    ])

    // Only on the calendar: no job, and nothing held.
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
    expect(bookingResources).not.toHaveBeenCalled()
    expect(loadBookingContext).not.toHaveBeenCalled()
  })

  it('keeps no description that says nothing', async () => {
    await createBooking(booking({ description: '<p>  </p>' }))
    expect(appointmentData().description).toBeNull()
  })

  it("refuses another workshop's car and creates nothing", async () => {
    db.vehicle.findFirst.mockResolvedValue(null)

    const result = await createBooking(booking({ vehicleId: 'someone-elses-car' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vehicle not found')
    expect(db.appointment.create).not.toHaveBeenCalled()
  })
})

describe('createBooking: a work order', () => {
  it('needs a car or a customer, and writes nothing without one', async () => {
    const result = await createBooking(booking({ kind: 'workOrder', work: 'Brakes' }))

    expect(result.success).toBe(false)
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
    expect(db.appointment.create).not.toHaveBeenCalled()
    expect(db.appointmentNotification.createMany).not.toHaveBeenCalled()
  })

  it('books a scheduled job with the work lines as its concerns, in a free bay', async () => {
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }, { workBayId: 'bay-2' }])
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' })],
      hours: {},
      closuresEnabled: false,
    })

    const result = await createBooking(
      booking({
        kind: 'workOrder',
        title: 'Brake job',
        vehicleId: 'veh-1',
        work: 'Front brakes squeal\n\n  Oil service  \n',
        notifications: [{ channel: 'in_app', amount: 1, unit: 'hours', atTime: null }],
      })
    )

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      kind: 'workOrder',
      id: 'job-1',
      ref: '2026-1044',
      vehicleId: 'veh-1',
      overbooked: false,
    })
    const job = jobData()
    expect(job.organizationId).toBe(ORG)
    expect(job.title).toBe('Brake job')
    expect(job.vehicleId).toBe('veh-1')
    expect(job.startDateTime).toEqual(new Date('2026-11-16T08:30:00Z'))
    expect(job.endDateTime).toEqual(new Date('2026-11-16T09:30:00Z'))
    expect(job.workBayId).toBe('bay-2')

    expect(jobUpdate().where).toEqual({ id: 'job-1' })
    expect(jobUpdate().data.status).toBe('scheduled')
    expect(jobUpdate().data.concerns.create).toEqual([
      { description: 'Front brakes squeal', sortOrder: 0 },
      { description: 'Oil service', sortOrder: 1 },
    ])
    expect(createdNotifications()).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        userId: USER,
        serviceRecordId: 'job-1',
        channel: 'in_app',
      }),
    ])
    expect(db.appointment.create).not.toHaveBeenCalled()
  })

  it('makes the title the only concern when no work lines are given', async () => {
    db.vehicle.findFirst.mockResolvedValue(null)

    const result = await createBooking(
      booking({ kind: 'workOrder', title: 'Winter tyres on', customerId: 'cust-1' })
    )

    expect(result.success).toBe(true)
    expect(jobData().customerId).toBe('cust-1')
    expect(jobData().vehicleId).toBeNull()
    expect(jobUpdate().data.concerns.create).toEqual([
      { description: 'Winter tyres on', sortOrder: 0 },
    ])
  })

  it('still books an hour where every bay is taken, and says so', async () => {
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }])
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' })],
      hours: {},
      closuresEnabled: false,
    })

    const result = await createBooking(
      booking({ kind: 'workOrder', vehicleId: 'veh-1', work: 'Service' })
    )

    expect(result.success).toBe(true)
    expect(result.data?.overbooked).toBe(true)
    expect(jobData().workBayId).toBeUndefined()
  })
})

describe('createBooking: an appointment made a work order', () => {
  it('books the job and takes the appointment off the calendar', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: 'appt-1' })

    const result = await createBooking(
      booking({
        kind: 'workOrder',
        vehicleId: 'veh-1',
        fromAppointmentId: 'appt-1',
        work: 'Service',
      })
    )

    expect(result.success).toBe(true)
    expect(db.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'appt-1', organizationId: ORG } })
    )
    expect(db.serviceRecord.create).toHaveBeenCalledTimes(1)
    expect(db.appointment.delete).toHaveBeenCalledWith({ where: { id: 'appt-1' } })
  })

  it("refuses another workshop's appointment and creates nothing", async () => {
    db.appointment.findFirst.mockResolvedValue(null)

    const result = await createBooking(
      booking({
        kind: 'workOrder',
        vehicleId: 'veh-1',
        fromAppointmentId: 'someone-elses-appt',
        work: 'Service',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Appointment not found')
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
    expect(db.appointment.delete).not.toHaveBeenCalled()
  })
})

describe('notifications to the customer', () => {
  it('need somebody to go to', async () => {
    const result = await createBooking(
      booking({ notifications: [{ channel: 'customer_sms', amount: 1, unit: 'days' }] })
    )

    expect(result.success).toBe(false)
    expect(db.appointment.create).not.toHaveBeenCalled()
  })

  it('are refused on the demo, while a notice in the app is not', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    vi.resetModules()
    const { createBooking: demoCreateBooking } = await import(
      '@/features/calendar/Actions/createBooking'
    )

    const toCustomer = await demoCreateBooking(
      booking({
        customerId: 'cust-1',
        notifications: [{ channel: 'customer_sms', amount: 1, unit: 'days' }],
      })
    )
    expect(toCustomer.success).toBe(false)
    expect(toCustomer.error).toMatch(/disabled on the demo/)
    expect(db.appointment.create).not.toHaveBeenCalled()

    const inApp = await demoCreateBooking(
      booking({
        customerId: 'cust-1',
        notifications: [{ channel: 'in_app', amount: 1, unit: 'hours' }],
      })
    )
    expect(inApp.success).toBe(true)
    expect(db.appointment.create).toHaveBeenCalledTimes(1)
  })
})

describe('updateBooking: an appointment', () => {
  it("refuses another workshop's appointment and changes nothing", async () => {
    db.appointment.findFirst.mockResolvedValue(null)

    const result = await updateBooking(booking({ id: 'someone-elses-appt' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Appointment not found')
    expect(db.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-appt', organizationId: ORG } })
    )
    expect(db.appointment.update).not.toHaveBeenCalled()
    expect(db.appointmentNotification.createMany).not.toHaveBeenCalled()
  })

  it('saves the new title, time and customer', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: 'appt-1' })

    const result = await updateBooking(
      booking({
        id: 'appt-1',
        title: 'Call Kari back',
        customerId: 'cust-1',
        startTime: '13:00',
        endTime: '13:15',
      })
    )

    expect(result.success).toBe(true)
    expect(db.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appt-1' },
        data: expect.objectContaining({
          title: 'Call Kari back',
          startAt: new Date('2026-11-16T12:00:00Z'),
          endAt: new Date('2026-11-16T12:15:00Z'),
          vehicleId: null,
          customerId: 'cust-1',
        }),
      })
    )
  })

  it('keeps a notification left as it was, drops one removed and adds a new one', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: 'appt-1' })
    db.appointmentNotification.findMany.mockResolvedValue([
      { id: 'n-kept', channel: 'in_app', amount: 1, unit: 'hours', atTime: null },
      { id: 'n-gone', channel: 'email', amount: 30, unit: 'minutes', atTime: null },
    ])

    const result = await updateBooking(
      booking({
        id: 'appt-1',
        notifications: [
          { channel: 'in_app', amount: 1, unit: 'hours', atTime: null },
          { channel: 'email', amount: 2, unit: 'days', atTime: '16:00' },
        ],
      })
    )

    expect(result.success).toBe(true)
    expect(db.appointmentNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, appointmentId: 'appt-1' } })
    )
    expect(db.appointmentNotification.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.appointmentNotification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-gone'] }, organizationId: ORG },
    })
    expect(createdNotifications()).toEqual([
      {
        organizationId: ORG,
        userId: USER,
        appointmentId: 'appt-1',
        channel: 'email',
        amount: 2,
        unit: 'days',
        atTime: '16:00',
      },
    ])
  })
})

/** A booked job whose car has not arrived: Monday 08:00 to 09:00 in Oslo, in bay 1. */
function bookedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    status: 'scheduled',
    invoiceNumber: '2026-1044',
    vehicleId: 'veh-1',
    customerId: null,
    startDateTime: new Date('2026-11-16T07:00:00Z'),
    endDateTime: new Date('2026-11-16T08:00:00Z'),
    technicianId: null,
    workBayId: 'bay-1',
    concerns: [
      {
        description: 'Brakes',
        cause: null,
        correction: null,
        confirmation: null,
        confirmedAt: null,
        _count: { findings: 0, attachments: 0 },
      },
    ],
    ...overrides,
  }
}

const jobEdit = (overrides: Partial<SaveBookingInput> = {}) =>
  booking({
    kind: 'workOrder',
    id: 'job-1',
    title: 'Brakes',
    vehicleId: 'veh-1',
    work: 'Brakes',
    startTime: '08:00',
    endTime: '09:00',
    ...overrides,
  })

describe('updateBooking: a booked job', () => {
  it('is refused once the job has started', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(bookedJob({ status: 'in_progress' }))

    const result = await updateBooking(jobEdit({ title: 'Brakes and oil' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('The job has started. Change it on the work order.')
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it("refuses another workshop's job", async () => {
    db.serviceRecord.findFirst.mockResolvedValue(null)

    const result = await updateBooking(jobEdit({ id: 'someone-elses-job' }))

    expect(result.success).toBe(false)
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-job', organizationId: ORG } })
    )
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('keeps its bay when moved to a time the bay is still free, not counting itself', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(bookedJob())
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }, { workBayId: 'bay-2' }])
    // The job's own booking sits in bay 1 and would clash with the new time.
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' }, 'job-1')],
      hours: {},
      closuresEnabled: false,
    })

    const result = await updateBooking(jobEdit({ startTime: '09:30', endTime: '10:30' }))

    expect(result.success).toBe(true)
    expect(result.data?.overbooked).toBe(false)
    expect(jobUpdate().where).toEqual({ id: 'job-1' })
    expect(jobUpdate().data).toMatchObject({
      startDateTime: new Date('2026-11-16T08:30:00Z'),
      endDateTime: new Date('2026-11-16T09:30:00Z'),
      workBayId: 'bay-1',
    })
  })

  it('takes another bay when its own is taken at the new time', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(bookedJob())
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }, { workBayId: 'bay-2' }])
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' })],
      hours: {},
      closuresEnabled: false,
    })

    const result = await updateBooking(jobEdit({ startTime: '09:30', endTime: '10:30' }))

    expect(result.success).toBe(true)
    expect(jobUpdate().data.workBayId).toBe('bay-2')
  })

  it('replaces the concerns with the new work lines while nothing is recorded on them', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(bookedJob())

    const result = await updateBooking(jobEdit({ work: 'Brakes\nOil service' }))

    expect(result.success).toBe(true)
    expect(db.serviceConcern.deleteMany).toHaveBeenCalledWith({
      where: { serviceRecordId: 'job-1' },
    })
    expect(db.serviceConcern.createMany).toHaveBeenCalledWith({
      data: [
        { serviceRecordId: 'job-1', description: 'Brakes', sortOrder: 0 },
        { serviceRecordId: 'job-1', description: 'Oil service', sortOrder: 1 },
      ],
    })
  })

  it.each([
    ['a cause', { cause: 'Worn pads' }],
    ['a correction', { correction: 'Replaced pads' }],
    ['a confirmation', { confirmation: 'Road tested' }],
    ['a confirmed time', { confirmedAt: new Date('2026-11-10T10:00:00Z') }],
    ['a finding', { _count: { findings: 1, attachments: 0 } }],
    ['an attachment', { _count: { findings: 0, attachments: 1 } }],
  ])('refuses to change the work lines once a concern has %s', async (_what, recorded) => {
    db.serviceRecord.findFirst.mockResolvedValue(
      bookedJob({ concerns: [{ ...bookedJob().concerns[0], ...recorded }] })
    )

    const result = await updateBooking(jobEdit({ work: 'Brakes\nOil service' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Work is recorded on these concerns. Change them on the work order.')
    expect(db.serviceConcern.deleteMany).not.toHaveBeenCalled()
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('still saves a job with recorded concerns when the work lines are left alone', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(
      bookedJob({ concerns: [{ ...bookedJob().concerns[0], cause: 'Worn pads' }] })
    )

    const result = await updateBooking(jobEdit({ title: 'Brakes, front' }))

    expect(result.success).toBe(true)
    expect(jobUpdate().data.title).toBe('Brakes, front')
    expect(db.serviceConcern.deleteMany).not.toHaveBeenCalled()
  })

  it("adds the customer's own car to a booking made for the customer alone", async () => {
    db.serviceRecord.findFirst.mockResolvedValue(
      bookedJob({ vehicleId: null, customerId: 'cust-1' })
    )

    const result = await updateBooking(jobEdit({ vehicleId: 'veh-1', customerId: 'cust-1' }))

    expect(result.success).toBe(true)
    expect(db.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'veh-1', organizationId: ORG } })
    )
    // A job on a car finds its customer through the car.
    expect(jobUpdate().data).toMatchObject({ vehicleId: 'veh-1', customerId: null })
  })

  it("refuses another customer's car on a customer's booking", async () => {
    db.serviceRecord.findFirst.mockResolvedValue(
      bookedJob({ vehicleId: null, customerId: 'cust-1' })
    )
    db.vehicle.findFirst.mockResolvedValue({
      id: 'veh-2',
      customerId: 'cust-2',
      customer: { taxExempt: false },
    })

    const result = await updateBooking(jobEdit({ vehicleId: 'veh-2', customerId: 'cust-1' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('That car belongs to another customer')
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('refuses to change the car of a job that has one', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(bookedJob())

    const result = await updateBooking(jobEdit({ vehicleId: 'veh-2' }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Change the car on the work order')
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })
})

describe('deleteAppointment', () => {
  it('takes an appointment of this workshop off the calendar', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: 'appt-1', title: 'Call Kari' })

    const result = await deleteAppointment('appt-1')

    expect(result.success).toBe(true)
    expect(db.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'appt-1', organizationId: ORG } })
    )
    expect(db.appointment.delete).toHaveBeenCalledWith({ where: { id: 'appt-1' } })
  })

  it("refuses another workshop's appointment", async () => {
    db.appointment.findFirst.mockResolvedValue(null)

    const result = await deleteAppointment('someone-elses-appt')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Appointment not found')
    expect(db.appointment.delete).not.toHaveBeenCalled()
  })
})

describe('who may book', () => {
  it('refuses a role that may not create jobs', async () => {
    signInAs('member', [{ action: 'read', subject: 'services' }])

    const result = await createBooking(booking())

    expect(result.success).toBe(false)
    expect(result.forbidden).toBe(true)
    expect(db.appointment.create).not.toHaveBeenCalled()
  })

  it('lets a role that may create jobs book', async () => {
    signInAs('member', [{ action: 'create', subject: 'services' }])

    const result = await createBooking(booking())

    expect(result.success).toBe(true)
    expect(db.appointment.create).toHaveBeenCalledTimes(1)
  })
})
