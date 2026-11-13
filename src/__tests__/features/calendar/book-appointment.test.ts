/**
 * An appointment booked from the calendar is a scheduled job on the
 * workshop's own clock, with what the customer asked for as its concerns,
 * one per line, which is what the printed work order lists as work requested.
 * It holds a bay, or a technician in a shop without bays, so the online
 * booking page cannot offer the same hour to a customer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/workshop-timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop-timezone')>()),
  workshopTimeZone: async () => 'Europe/Oslo',
}))
const loadBookingContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/workboard/Lib/bookings', () => ({ loadBookingContext }))
const bookingResources = vi.hoisted(() => vi.fn())
vi.mock('@/features/inspection-reminders/Lib/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/inspection-reminders/Lib/booking')>()),
  bookingResources,
}))
vi.mock('@/lib/db', () => {
  const db = {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    technician: { findFirst: vi.fn() },
    workBay: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  }
  return { db }
})

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { bookAppointment } from '@/features/calendar/Actions/bookAppointment'
import { updateServiceSchema } from '@/features/vehicles/Schema/serviceSchema'

const ORG = 'org-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'office@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false, name: 'Kari' } as never)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([])
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Test Shop' } as never)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ invoiceNumber: '2026-1043' } as never)
  vi.mocked(db.serviceRecord.create).mockResolvedValue({ id: 'job-1' } as never)
  vi.mocked(db.serviceRecord.update).mockResolvedValue({
    id: 'job-1',
    vehicleId: 'veh-1',
    invoiceNumber: '2026-1044',
  } as never)
  // The transaction hands the same client in, so its writes are the ones read below.
  vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: typeof db) => unknown) =>
    fn(db)) as never)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    id: 'veh-1',
    customer: { taxExempt: false },
  } as never)
  vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
  vi.mocked(db.technician.findFirst).mockResolvedValue({ name: 'Tech' } as never)
  vi.mocked(db.workBay.findFirst).mockResolvedValue({ id: 'bay' } as never)
  // A shop with nothing set up to hold, unless a test says otherwise.
  bookingResources.mockResolvedValue([])
  loadBookingContext.mockResolvedValue({ bookings: [], hours: {}, closuresEnabled: false })
})

/** Tuesday 17 November 2026, 09:30 to 12:00 in Oslo: 08:30 to 11:00 UTC. */
const TUESDAY = {
  vehicleId: 'veh-1',
  work: 'Service',
  date: '2026-11-17',
  time: '09:30',
  durationMinutes: 150,
}

/** Something already holding a bay or a person on Tuesday, 08:00 to 09:00 UTC. */
function held(resource: { workBayId?: string; technicianId?: string }) {
  return {
    id: 'other-job',
    kind: 'serviceRecord' as const,
    label: 'Brakes',
    start: new Date('2026-11-17T08:00:00Z'),
    end: new Date('2026-11-17T09:00:00Z'),
    ...resource,
  }
}

function created() {
  return vi.mocked(db.serviceRecord.create).mock.calls[0][0].data as Record<string, unknown>
}
function updated() {
  return vi.mocked(db.serviceRecord.update).mock.calls[0][0] as {
    where: { id: string }
    data: { status: string; concerns: { create: { description: string; sortOrder: number }[] } }
  }
}

describe('bookAppointment', () => {
  it("books the car at the workshop's own clock, for as long as was said", async () => {
    const result = await bookAppointment({
      vehicleId: 'veh-1',
      work: 'Front brakes squeal\n\n  Oil service  \n',
      date: '2026-11-17',
      time: '09:30',
      durationMinutes: 150,
    })

    expect(result.success).toBe(true)
    // 09:30 in Oslo in November is 08:30 UTC, whatever the server's own zone.
    expect(created().startDateTime).toEqual(new Date('2026-11-17T08:30:00Z'))
    expect(created().endDateTime).toEqual(new Date('2026-11-17T11:00:00Z'))
    expect(created().vehicleId).toBe('veh-1')
    expect(created().customerId).toBeNull()
    expect(created().title).toBe('Front brakes squeal')
    // A job like any other: it takes the next number.
    expect(created().invoiceNumber).toBe('2026-1044')

    expect(updated().where).toEqual({ id: 'job-1' })
    expect(updated().data.status).toBe('scheduled')
    expect(updated().data.concerns.create).toEqual([
      { description: 'Front brakes squeal', sortOrder: 0 },
      { description: 'Oil service', sortOrder: 1 },
    ])
  })

  it('books a customer whose car is not on file yet as work on a car', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-1', taxExempt: false } as never)
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'invoice.shopFeeEnabled', value: 'true' },
      { key: 'invoice.shopFeeMode', value: 'flat' },
      { key: 'invoice.shopFeeAmount', value: '75' },
    ] as never)

    const result = await bookAppointment({
      customerId: 'cust-1',
      work: 'New customer, timing belt',
      date: '2026-11-18',
      time: '12:00',
      durationMinutes: 240,
    })

    expect(result.success).toBe(true)
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cust-1', organizationId: ORG } })
    )
    expect(created().vehicleId).toBeNull()
    expect(created().customerId).toBe('cust-1')
    // The shop fee a counter sale leaves off is on the job from the start.
    expect(created().laborItems).toEqual({
      create: [expect.objectContaining({ total: 75 })],
    })
  })

  it("refuses another workshop's car and creates nothing", async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)

    const result = await bookAppointment({
      vehicleId: 'someone-elses-car',
      work: 'Service',
      date: '2026-11-17',
      time: '09:00',
      durationMinutes: 60,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vehicle not found')
    expect(db.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-car', organizationId: ORG } })
    )
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
  })

  it('needs a car or a customer, and something to do', async () => {
    const nobody = await bookAppointment({
      work: 'Service',
      date: '2026-11-17',
      time: '09:00',
      durationMinutes: 60,
    })
    const nothing = await bookAppointment({
      vehicleId: 'veh-1',
      work: '   ',
      date: '2026-11-17',
      time: '09:00',
      durationMinutes: 60,
    })

    expect(nobody.success).toBe(false)
    expect(nothing.success).toBe(false)
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
  })
})

describe('what an appointment holds', () => {
  it('takes a bay that is free for the whole appointment', async () => {
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }, { workBayId: 'bay-2' }])
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' })],
      hours: {},
      closuresEnabled: false,
    })

    const result = await bookAppointment(TUESDAY)

    expect(result.success).toBe(true)
    expect(created().workBayId).toBe('bay-2')
    expect(result.data?.overbooked).toBe(false)
  })

  it("in a shop without bays, takes the default technician when they're free", async () => {
    bookingResources.mockResolvedValue([{ technicianId: 'tech-a' }, { technicianId: 'tech-b' }])
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: 'tech-b' } as never)

    await bookAppointment(TUESDAY)

    expect(created().technicianId).toBe('tech-b')
  })

  it('takes another technician when the default one is busy then', async () => {
    bookingResources.mockResolvedValue([{ technicianId: 'tech-a' }, { technicianId: 'tech-b' }])
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: 'tech-b' } as never)
    loadBookingContext.mockResolvedValue({
      bookings: [held({ technicianId: 'tech-b' })],
      hours: {},
      closuresEnabled: false,
    })

    await bookAppointment(TUESDAY)

    expect(created().technicianId).toBe('tech-a')
  })

  it('still books an hour where everything is taken, and says so', async () => {
    bookingResources.mockResolvedValue([{ workBayId: 'bay-1' }])
    loadBookingContext.mockResolvedValue({
      bookings: [held({ workBayId: 'bay-1' })],
      hours: {},
      closuresEnabled: false,
    })

    const result = await bookAppointment(TUESDAY)

    expect(result.success).toBe(true)
    expect(created().workBayId).toBeUndefined()
    expect(result.data?.overbooked).toBe(true)
  })

  it('refuses a day that does not exist rather than booking another one', async () => {
    const result = await bookAppointment({ ...TUESDAY, date: '2026-02-31' })

    expect(result.success).toBe(false)
    expect(db.serviceRecord.create).not.toHaveBeenCalled()
  })
})

describe('a booked job on the work order page', () => {
  it('can be saved while the car has not arrived yet', () => {
    // The page sends the status back as it found it.
    const saved = updateServiceSchema.safeParse({ id: 'job-1', status: 'scheduled' })
    expect(saved.success).toBe(true)
  })
})
