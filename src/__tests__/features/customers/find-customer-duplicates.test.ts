/**
 * The duplicate checks read only this workshop's records, never the record
 * being edited, and compare the way people write: an email without case, a
 * phone number by its digits, a plate without spaces and hyphens. A phone
 * number with letters in it is refused by the customer's own rules.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    vehicle: { findMany: vi.fn() },
  },
}))

import type { Prisma } from '@/generated/prisma/client'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { findCustomerDuplicates } from '@/features/customers/Actions/findCustomerDuplicates'
import { findVehiclesWithPlate } from '@/features/vehicles/Actions/findVehiclesWithPlate'
import {
  createCustomerSchema,
  updateCustomerSchema,
} from '@/features/customers/Schema/customerSchema'
import { fieldErrorsFromZod } from '@/lib/field-errors'
import { looksLikeVin } from '@/features/vehicles/Lib/vehicleIdentifiers'

const ORG = 'org-a'

/** Each raw query the action ran, with the values bound into it. */
const queries = () =>
  vi.mocked(db.$queryRaw).mock.calls.map((call) => {
    const sql = call[0] as unknown as Prisma.Sql
    return { text: sql.sql, values: sql.values }
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.$queryRaw).mockResolvedValue([] as never)
})

describe('findCustomerDuplicates', () => {
  it('asks only within this workshop, leaving out the customer being edited', async () => {
    const result = await findCustomerDuplicates({
      name: '  ZZ  Kari   Testvik ',
      email: ' Kari@Testvik.Example ',
      phone: '+00 (912) 34-567',
      excludeId: 'cust-1',
    })
    expect(result).toEqual({ success: true, data: { email: [], phone: [], name: [] } })
    const asked = queries()
    expect(asked).toHaveLength(3)
    for (const query of asked) {
      expect(query.text).toContain('"organizationId" =')
      expect(query.values).toContain(ORG)
      expect(query.values).toContain('cust-1')
    }
    expect(asked[0].values).toContain('kari@testvik.example')
    expect(asked[1].values).toContain('0091234567')
    expect(asked[2].values).toContain('zz kari testvik')
  })

  it('does not compare a phone number too short to tell people apart', async () => {
    await findCustomerDuplicates({ phone: '12' })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('hands back who matched each field', async () => {
    const kari = { id: 'cust-kari', name: 'ZZ Kari Testvik', company: null }
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([kari] as never)
    const result = await findCustomerDuplicates({ email: 'kari@testvik.example' })
    expect(result.data).toEqual({ email: [kari], phone: [], name: [] })
  })
})

describe('findVehiclesWithPlate', () => {
  it('compares the plate without spaces and hyphens, in this workshop only', async () => {
    const other = {
      id: 'veh-2',
      year: 2011,
      make: 'BMW',
      model: '520d',
      licensePlate: 'ZZ 10001',
      customer: { id: 'cust-kari', name: 'ZZ Kari Testvik' },
    }
    vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'veh-2' }] as never)
    vi.mocked(db.vehicle.findMany).mockResolvedValue([other] as never)

    const result = await findVehiclesWithPlate({ plate: 'zz-100 01', excludeId: 'veh-1' })

    expect(result).toEqual({ success: true, data: [other] })
    const [query] = queries()
    expect(query.values).toEqual(expect.arrayContaining([ORG, 'veh-1', 'ZZ10001']))
    expect(vi.mocked(db.vehicle.findMany).mock.calls[0][0]?.where).toMatchObject({
      organizationId: ORG,
    })
  })

  it('asks nothing for an empty plate', async () => {
    const result = await findVehiclesWithPlate({ plate: ' - ' })
    expect(result).toEqual({ success: true, data: [] })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('the customer rules for a phone number', () => {
  it('refuse letters and signs, said as a phone problem', () => {
    const parsed = createCustomerSchema.safeParse({ name: 'ZZ Kari', phone: 'abc-not-a-phone!!' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(fieldErrorsFromZod(parsed.error)).toEqual([{ field: 'phone', issue: 'phone' }])
  })

  it('refuse a number with no digits at all', () => {
    expect(createCustomerSchema.safeParse({ name: 'ZZ Kari', phone: '+ ( ) -' }).success).toBe(
      false
    )
  })

  it('take a number however it is grouped, and an emptied field on an edit', () => {
    for (const phone of ['+47 912 34 567', '(020) 7946-0000', '030.1234.56', '']) {
      expect(createCustomerSchema.safeParse({ name: 'ZZ Kari', phone }).success).toBe(true)
    }
    expect(updateCustomerSchema.safeParse({ id: 'c', phone: '' }).success).toBe(true)
  })
})

describe('a VIN', () => {
  it('looks like one at seventeen letters and digits without I, O or Q', () => {
    expect(looksLikeVin('WBA5A71070G123456')).toBe(true)
    expect(looksLikeVin('wba5a71070g123456')).toBe(true)
    expect(looksLikeVin('')).toBe(true)
    expect(looksLikeVin('NOTAVIN-IOQ')).toBe(false)
    expect(looksLikeVin('WBA5A71070G12345')).toBe(false)
    expect(looksLikeVin('WBA5A71070G12345O')).toBe(false)
  })
})
