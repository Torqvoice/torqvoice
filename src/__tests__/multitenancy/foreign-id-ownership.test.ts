/**
 * A record may only point at customers and vehicles of its own workshop.
 *
 * Every write here loads its own row org-scoped. What these tests pin down
 * is the second half: the customerId and vehicleId it is handed are checked
 * against the workshop too, so a quote, a scheduled message, a vehicle or a
 * tire set can never be made to show another workshop's customer. A foreign
 * id fails the same way a foreign row id does, and an own id still passes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), auditDetails: vi.fn(() => ({})) }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { publish: vi.fn(), emit: vi.fn() } }))
vi.mock('@/lib/resolve-upload-path', () => ({ resolveUploadPath: vi.fn((u: string) => u) }))
vi.mock('@/lib/files/collect', () => ({
  quoteFileUrls: vi.fn(async () => []),
  vehicleFileUrls: vi.fn(async () => []),
  tireSetFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  parseStoredFileUrl: vi.fn(() => null),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  // The tire hotel is on; the gate has tests of its own.
  requireTireHotel: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    quote: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    vehicle: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    scheduledMessage: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { createQuote, updateQuote } from '@/features/quotes/Actions/quoteActions'
import { updateScheduledMessage } from '@/features/scheduled-messages/Actions/scheduledMessageActions'
import { checkInTireSet, updateTireSet } from '@/features/tire-hotel/Actions/tireSetActions'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const ORG = 'org-a'
const FOREIGN = 'cust-of-org-b'

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'owner@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([])
}

/** What Prisma answers for an id that is not in this workshop. */
function foreignCustomer() {
  vi.mocked(db.customer.findFirst).mockResolvedValue(null)
}
function ownCustomer() {
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-a', taxExempt: false } as never)
}
function foreignVehicle() {
  vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)
}

/** The lookup must have been scoped to the caller's workshop, not just the id. */
function expectScopedLookup(mock: { mock: { calls: unknown[][] } }, id: string) {
  const call = mock.mock.calls.find((c) => (c[0] as { where: { id: string } }).where.id === id)
  expect(call?.[0]).toMatchObject({ where: { id, organizationId: ORG } })
}

const QUOTE_ROW = {
  id: 'quote-a',
  status: 'draft',
  editUnlockedAt: null,
  taxComponents: null,
  taxRate: 25,
  taxInclusive: false,
  discountAmount: 0,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

const NEW_QUOTE = {
  title: 'Brakes',
  status: 'draft',
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 0,
}

beforeEach(() => {
  vi.resetAllMocks()
  setupAuth()
})

describe('quotes', () => {
  it('updateQuote refuses a customer from another workshop', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(QUOTE_ROW as never)
    foreignCustomer()

    const result = await updateQuote({ id: 'quote-a', customerId: FOREIGN })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
    expect(db.$transaction).not.toHaveBeenCalled()
    expectScopedLookup(vi.mocked(db.customer.findFirst), FOREIGN)
  })

  it('updateQuote refuses a vehicle from another workshop', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(QUOTE_ROW as never)
    foreignVehicle()

    const result = await updateQuote({ id: 'quote-a', vehicleId: 'veh-of-org-b' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vehicle not found')
    expect(db.$transaction).not.toHaveBeenCalled()
    expectScopedLookup(vi.mocked(db.vehicle.findFirst), 'veh-of-org-b')
  })

  it('updateQuote still writes an own customer, and still clears one', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(QUOTE_ROW as never)
    ownCustomer()
    vi.mocked(db.$transaction).mockResolvedValue({ id: 'quote-a' } as never)

    await updateQuote({ id: 'quote-a', customerId: 'cust-a' })
    expect(db.$transaction).toHaveBeenCalledTimes(1)

    vi.mocked(db.customer.findFirst).mockClear()
    await updateQuote({ id: 'quote-a', customerId: '' })
    // Clearing is not a lookup.
    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(db.$transaction).toHaveBeenCalledTimes(2)
  })

  it('createQuote refuses a customer from another workshop, even one it only read for tax', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(null)
    foreignCustomer()

    const result = await createQuote({ ...NEW_QUOTE, customerId: FOREIGN })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('createQuote refuses a vehicle from another workshop', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(null)
    foreignVehicle()

    const result = await createQuote({ ...NEW_QUOTE, vehicleId: 'veh-of-org-b' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vehicle not found')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('scheduled messages', () => {
  it('updateScheduledMessage refuses foreign ids and writes own ones', async () => {
    vi.mocked(db.scheduledMessage.findFirst).mockResolvedValue({ id: 'msg-1' } as never)
    foreignCustomer()

    const refused = await updateScheduledMessage({ id: 'msg-1', customerId: FOREIGN })
    expect(refused.success).toBe(false)
    expect(refused.error).toBe('Customer not found')
    expect(db.scheduledMessage.update).not.toHaveBeenCalled()

    ownCustomer()
    vi.mocked(db.scheduledMessage.update).mockResolvedValue({ id: 'msg-1' } as never)
    const ok = await updateScheduledMessage({ id: 'msg-1', customerId: 'cust-a' })
    expect(ok.success).toBe(true)
    expect(db.scheduledMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: 'cust-a' }) })
    )
  })
})

describe('vehicles', () => {
  it('createVehicle refuses an owner from another workshop and accepts an own one', async () => {
    foreignCustomer()

    const refused = await createVehicle({
      make: 'VW',
      model: 'Golf',
      year: 2020,
      customerId: FOREIGN,
    })
    expect(refused.success).toBe(false)
    expect(refused.error).toBe('Customer not found')
    expect(db.vehicle.create).not.toHaveBeenCalled()

    ownCustomer()
    vi.mocked(db.vehicle.create).mockResolvedValue({ id: 'veh-a' } as never)
    const ok = await createVehicle({ make: 'VW', model: 'Golf', year: 2020, customerId: 'cust-a' })
    expect(ok.success).toBe(true)
    expect(db.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: 'cust-a' }) })
    )
  })

  it('updateVehicle refuses moving a vehicle to a foreign owner', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ imageUrl: null } as never)
    foreignCustomer()

    const result = await updateVehicle({ id: 'veh-a', customerId: FOREIGN })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
  })
})

describe('tire sets', () => {
  /** A transaction client with a shelf that has room and a set of our own. */
  function tx(overrides: Record<string, unknown> = {}) {
    return {
      tireLocation: {
        findFirst: vi.fn().mockResolvedValue({ code: 'A1', capacity: 100, tireSets: [] }),
      },
      tireSet: {
        findFirst: vi.fn().mockResolvedValue({ id: 'set-a', quantity: 4, locationId: 'loc-1' }),
        create: vi.fn(),
        update: vi.fn(),
      },
      customer: { findFirst: vi.fn().mockResolvedValue(null) },
      vehicle: { findFirst: vi.fn().mockResolvedValue(null) },
      ...overrides,
    }
  }

  it('checkInTireSet refuses a customer named from another workshop', async () => {
    const client = tx()
    vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) =>
      (fn as (c: unknown) => Promise<unknown>)(client)
    )

    const result = await checkInTireSet({ locationId: 'loc-1', quantity: 4, customerId: FOREIGN })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
    expect(client.tireSet.create).not.toHaveBeenCalled()
    expect(client.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FOREIGN, organizationId: ORG } })
    )
  })

  it('updateTireSet refuses moving a set to a foreign vehicle or customer', async () => {
    const client = tx()
    vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) =>
      (fn as (c: unknown) => Promise<unknown>)(client)
    )

    const byVehicle = await updateTireSet({ id: 'set-a', vehicleId: 'veh-of-org-b' })
    expect(byVehicle.success).toBe(false)
    expect(byVehicle.error).toBe('Vehicle not found')

    const byCustomer = await updateTireSet({ id: 'set-a', customerId: FOREIGN })
    expect(byCustomer.success).toBe(false)
    expect(byCustomer.error).toBe('Customer not found')

    expect(client.tireSet.update).not.toHaveBeenCalled()
  })
})
