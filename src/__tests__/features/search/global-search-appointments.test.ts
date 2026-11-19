/**
 * Plain appointments in the search palette: a workshop on the phone types the
 * plate or what the visit is about and finds the booking, on its own clock,
 * the coming ones first, and never another workshop's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  isTireHotelEnabled: vi.fn(async () => false),
}))
// No fleet number either, as for every workshop that has not switched it on.
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  isTypeKeyEnabled: vi.fn(async () => false),
}))
// The Reference / PO field is off here, as it is for every workshop that has
// not asked for it; the rest of the module is the real one.
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/inventory/Lib/tagSearch.server', () => ({
  partIdsWithTagContaining: vi.fn(async () => []),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    vehicle: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    inventoryPart: { findMany: vi.fn() },
    quote: { findMany: vi.fn() },
    reminder: { findMany: vi.fn() },
    inspection: { findMany: vi.fn() },
    tireSet: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { globalSearch } from '@/features/search/Actions/searchActions'

const ORG = 'org-a'

type Row = Record<string, unknown>

/** Enough of Prisma's `where` to run the palette's query against a table. */
function matches(row: unknown, where: unknown): boolean {
  if (where === undefined) return true
  const w = where as Record<string, unknown>
  return Object.entries(w).every(([key, cond]) => {
    if (key === 'AND') return (cond as unknown[]).every((c) => matches(row, c))
    if (key === 'OR') return (cond as unknown[]).some((c) => matches(row, c))
    const value = (row as Row | null)?.[key]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ('contains' in c) {
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes(String(c.contains).toLowerCase())
        )
      }
      if ('gte' in c) return value instanceof Date && value >= (c.gte as Date)
      if ('lt' in c) return value instanceof Date && value < (c.lt as Date)
      return value != null && matches(value, c)
    }
    return value === cond
  })
}

const NOW = Date.now()
const DAY = 24 * 60 * 60 * 1000

const car = {
  id: 'car-1',
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  licensePlate: 'EK12345',
  customer: { id: 'cust-1', name: 'Test Testesen' },
}

const APPOINTMENTS: Row[] = [
  {
    id: 'appt-past',
    organizationId: ORG,
    title: 'Test drive after repair',
    description: null,
    startAt: new Date(NOW - 7 * DAY),
    customer: null,
    vehicle: car,
  },
  {
    id: 'appt-next',
    organizationId: ORG,
    title: 'Talk about winter tyres',
    description: '<p>Bring the rims</p>',
    // 10:30 in Auckland on a fixed day well ahead.
    startAt: new Date('2099-03-10T21:30:00Z'),
    customer: { id: 'cust-1', name: 'Test Testesen' },
    vehicle: car,
  },
  {
    id: 'appt-other-workshop',
    organizationId: 'org-b',
    title: 'Talk about winter tyres',
    description: null,
    startAt: new Date(NOW + 2 * DAY),
    customer: null,
    vehicle: { ...car, id: 'car-b' },
  },
]

function signInAs(role: 'owner' | 'member', permissions: { action: string; subject: string }[]) {
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role,
    roleId: role === 'member' ? 'role-1' : null,
    customRole: role === 'member' ? { isAdmin: false, permissions } : null,
  } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@x.com' },
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.auditLog.create).mockResolvedValue({} as never)
  for (const model of [
    db.vehicle,
    db.customer,
    db.serviceRecord,
    db.inventoryPart,
    db.quote,
    db.reminder,
    db.inspection,
    db.tireSet,
  ]) {
    vi.mocked(model.findMany).mockResolvedValue([] as never)
  }
  vi.mocked(db.appointment.findMany).mockImplementation((async (args: {
    where: unknown
    orderBy: { startAt: 'asc' | 'desc' }
    take: number
  }) => {
    const rows = APPOINTMENTS.filter((a) => matches(a, args.where)).sort(
      (a, b) =>
        ((a.startAt as Date).getTime() - (b.startAt as Date).getTime()) *
        (args.orderBy.startAt === 'asc' ? 1 : -1)
    )
    return rows.slice(0, args.take)
  }) as never)
  signInAs('owner', [])
})

describe('appointments in the search palette', () => {
  it('finds an appointment by the plate of its car, coming ones first', async () => {
    const result = await globalSearch('ek12345')
    expect(result.success).toBe(true)
    expect(result.data?.appointments.map((a) => a.id)).toEqual(['appt-next', 'appt-past'])
  })

  it('finds an appointment by its title and shows it on the workshop clock', async () => {
    const result = await globalSearch('winter tyres')
    const found = result.data?.appointments ?? []
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      id: 'appt-next',
      title: 'Talk about winter tyres',
      date: '2099-03-11',
      time: '10:30',
      upcoming: true,
      customer: { name: 'Test Testesen' },
      vehicle: { licensePlate: 'EK12345' },
    })
  })

  it('never shows another workshop’s appointment', async () => {
    const result = await globalSearch('winter tyres')
    expect(result.data?.appointments.map((a) => a.id)).not.toContain('appt-other-workshop')
    for (const [args] of vi.mocked(db.appointment.findMany).mock.calls) {
      expect(JSON.stringify(args?.where)).toContain(`"organizationId":"${ORG}"`)
    }
  })

  it('leaves appointments out for a role that cannot open the calendar', async () => {
    signInAs('member', [{ action: 'read', subject: 'dashboard' }])
    const result = await globalSearch('winter tyres')
    expect(result.success).toBe(true)
    expect(result.data?.appointments).toEqual([])
    expect(db.appointment.findMany).not.toHaveBeenCalled()
  })
})
