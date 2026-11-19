/**
 * @vitest-environment node
 *
 * A custom field value is keyed by the id of its work order or quote, with no
 * foreign key, so the database removes nothing when that record is deleted.
 * The values used to stay behind for good. Every delete now takes them along,
 * for the records it deleted and for this workshop only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ list: [] as { key: string; args: unknown }[] }))
const rows = vi.hoisted(() => ({
  findFirst: {} as Record<string, unknown>,
  findMany: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({ user: { id: 'user-a', email: 'a@x.test' } })),
  getCachedMembership: vi.fn(async () => ({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), auditDetails: vi.fn(() => undefined) }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/demo', () => ({
  demoGuard: vi.fn(),
  demoGuardSettingKey: vi.fn(),
  isDemoMode: vi.fn(() => false),
}))
vi.mock('@/lib/features', () => ({
  requireFeature: vi.fn(),
  getFeatures: vi.fn(async () => ({})),
}))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(),
  assertQuoteEditable: vi.fn(),
  getDocumentLockSettings: vi.fn(async () => ({})),
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({ onInventoryChanged: vi.fn() }))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn(),
}))
vi.mock('@/features/settings/Lib/armFeatureHints', () => ({ armFeatureHints: vi.fn() }))
vi.mock('@/lib/torqvoice-com', () => ({
  billingRequest: vi.fn(),
  isTorqvoiceComBillingConfigured: vi.fn(() => false),
}))
vi.mock('@/lib/files/collect', () => ({
  serviceRecordFileUrls: vi.fn(async () => []),
  inspectionFileUrls: vi.fn(async () => []),
  vehicleFileUrls: vi.fn(async () => []),
  quoteFileUrls: vi.fn(async () => []),
  tireSetFileUrls: vi.fn(async () => []),
  inventoryPartFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  removeOrganizationFiles: vi.fn(),
  parseStoredFileUrl: () => null,
}))

/**
 * A database stand-in that records every call with what it was given.
 * `findFirst` answers from `rows.findFirst[model]`, `findMany` from
 * `rows.findMany[model]`; writes answer with one row changed.
 */
vi.mock('@/lib/db', () => {
  const method = (model: string, name: string) => async (args: unknown) => {
    calls.list.push({ key: `${model}.${name}`, args })
    if (name === 'findFirst' || name === 'findUnique') return rows.findFirst[model] ?? null
    if (name === 'findMany') return rows.findMany[model] ?? []
    if (name === 'count') return 0
    if (name.endsWith('Many')) return { count: 1 }
    return {}
  }
  const client: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, model: string) => {
        if (model === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function' ? arg(client) : Promise.all(arg as Promise<unknown>[])
        }
        if (model === 'then') return undefined
        return new Proxy({}, { get: (__, name: string) => method(model, name) })
      },
    }
  )
  return { db: client }
})

import { deleteCustomFieldValuesOf } from '@/features/custom-fields/Lib/deleteCustomFieldValues'

const index = (key: string) => calls.list.findIndex((call) => call.key === key)
const valueDeletes = () =>
  calls.list.filter((call) => call.key === 'customFieldValue.deleteMany').map((call) => call.args)

beforeEach(() => {
  calls.list = []
  rows.findFirst = { user: { isSuperAdmin: false } }
  rows.findMany = {}
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('deleting a work order', () => {
  it('removes its custom field values in the same transaction, after the record', async () => {
    rows.findFirst.serviceRecord = { id: 'sr-1', vehicleId: 'v-1', invoiceNumber: 'WO-1' }
    const { deleteServiceRecord } = await import('@/features/vehicles/Actions/serviceActions')

    expect((await deleteServiceRecord('sr-1')).success).toBe(true)

    expect(valueDeletes()).toEqual([
      {
        where: {
          entityType: 'service_record',
          entityId: { in: ['sr-1'] },
          field: { organizationId: 'org-a' },
        },
      },
    ])
    expect(index('customFieldValue.deleteMany')).toBeGreaterThan(index('serviceRecord.delete'))
  })

  it('removes nothing when the work order is not this workshop’s', async () => {
    const { deleteServiceRecord } = await import('@/features/vehicles/Actions/serviceActions')

    expect((await deleteServiceRecord('theirs')).success).toBe(false)

    expect(valueDeletes()).toEqual([])
  })
})

describe('deleting a quote', () => {
  it('removes its custom field values with it', async () => {
    rows.findFirst.quote = { id: 'q-1', organizationId: 'org-a' }
    const { deleteQuote } = await import('@/features/quotes/Actions/quoteActions')

    expect((await deleteQuote('q-1')).success).toBe(true)

    expect(valueDeletes()).toEqual([
      {
        where: {
          entityType: 'quote',
          entityId: { in: ['q-1'] },
          field: { organizationId: 'org-a' },
        },
      },
    ])
    expect(index('customFieldValue.deleteMany')).toBeGreaterThan(index('quote.deleteMany'))
  })

  it('removes nothing when the quote is not this workshop’s', async () => {
    const { deleteQuote } = await import('@/features/quotes/Actions/quoteActions')

    expect((await deleteQuote('theirs')).success).toBe(false)

    expect(valueDeletes()).toEqual([])
  })
})

describe('deleting a vehicle, which takes its work orders with it', () => {
  const expected = [
    {
      where: {
        entityType: 'service_record',
        entityId: { in: ['sr-1', 'sr-2'] },
        field: { organizationId: 'org-a' },
      },
    },
  ]

  it('removes the values of those work orders, from the vehicles list', async () => {
    rows.findFirst.vehicle = { year: 2020, make: 'Ford', model: 'F-150', licensePlate: null }
    rows.findMany.serviceRecord = [{ id: 'sr-1' }, { id: 'sr-2' }]
    const { deleteVehicle } = await import('@/features/vehicles/Actions/vehicleActions')

    expect((await deleteVehicle('v-1')).success).toBe(true)

    expect(valueDeletes()).toEqual(expected)
    // Read while the work orders could still be found.
    expect(index('serviceRecord.findMany')).toBeLessThan(index('vehicle.deleteMany'))
    expect(calls.list[index('serviceRecord.findMany')].args).toEqual({
      where: { organizationId: 'org-a', vehicleId: { in: ['v-1'] } },
      select: { id: true },
    })
  })

  it('removes them from the vehicle’s own page too', async () => {
    rows.findMany.serviceRecord = [{ id: 'sr-1' }, { id: 'sr-2' }]
    const { deleteVehicle } = await import('@/features/vehicles/Actions/deleteVehicle')

    expect((await deleteVehicle('v-1')).success).toBe(true)

    expect(valueDeletes()).toEqual(expected)
  })

  it('asks for nothing when the vehicle had no work orders', async () => {
    const { deleteVehicle } = await import('@/features/vehicles/Actions/deleteVehicle')

    expect((await deleteVehicle('v-1')).success).toBe(true)

    expect(valueDeletes()).toEqual([])
  })
})

describe('delete content', () => {
  it('removes every work order value with the vehicles, and every quote value with the quotes', async () => {
    const { deleteContent } = await import('@/features/settings/Actions/deleteContent')

    const result = await deleteContent({ vehicles: true, quotes: true } as never)

    expect(result.success).toBe(true)
    expect(valueDeletes()).toEqual([
      { where: { entityType: 'service_record', field: { organizationId: 'org-a' } } },
      { where: { entityType: 'quote', field: { organizationId: 'org-a' } } },
    ])
    // The field definitions were not ticked, so they stay.
    expect(index('customFieldDefinition.deleteMany')).toBe(-1)
  })

  it('leaves quote values alone when only vehicles are deleted', async () => {
    const { deleteContent } = await import('@/features/settings/Actions/deleteContent')

    await deleteContent({ vehicles: true } as never)

    expect(valueDeletes()).toEqual([
      { where: { entityType: 'service_record', field: { organizationId: 'org-a' } } },
    ])
  })
})

describe('the helper every delete goes through', () => {
  const store = () => {
    const deleteMany = vi.fn(async (_args: { where: { entityId?: { in: string[] } } }) => ({
      count: 0,
    }))
    return { store: { customFieldValue: { deleteMany } }, deleteMany }
  }

  it('asks the database nothing for an empty list', async () => {
    const { store: s, deleteMany } = store()
    await deleteCustomFieldValuesOf(s, 'org-a', 'quote', [])
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('splits a very long list so no single query is too large', async () => {
    const { store: s, deleteMany } = store()
    const ids = Array.from({ length: 12000 }, (_, i) => `sr-${i}`)

    await deleteCustomFieldValuesOf(s, 'org-a', 'service_record', ids)

    const asked = deleteMany.mock.calls.flatMap(([args]) => args.where.entityId?.in ?? [])
    expect(deleteMany).toHaveBeenCalledTimes(3)
    expect(asked).toEqual(ids)
  })

  it('never reaches past the workshop, whatever ids it is given', async () => {
    const { store: s, deleteMany } = store()
    await deleteCustomFieldValuesOf(s, 'org-a', 'quote', ['q-of-another-workshop'])
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        entityType: 'quote',
        entityId: { in: ['q-of-another-workshop'] },
        field: { organizationId: 'org-a' },
      },
    })
  })
})
