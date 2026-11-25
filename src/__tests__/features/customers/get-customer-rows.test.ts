/**
 * @vitest-environment node
 *
 * The customer list loads in batches as it scrolls (getCustomerRows). Walking
 * it batch by batch has to show every customer the search finds exactly
 * once, in the order the column says, whatever it is sorted by, and only the
 * signed-in workshop's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countKeysetIds,
  inMemoryTable,
  ordered,
  walkBatches,
} from '@/__tests__/helpers/in-memory-table'

type Customer = {
  id: string
  organizationId: string
  customerNumber: string | null
  name: string
  email: string | null
  phone: string | null
  company: string | null
  updatedAt: Date
  poRequired: boolean
  vehicles: { id: string }[]
}

let customers: Customer[] = []
const table = inMemoryTable(() => customers)
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({ db: { customer: { findMany, count } } }))
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
// The vehicle-count sort's SQL, answered from the same rows (the query itself
// is checked against Postgres). The cursor check is the real one.
vi.mock('@/features/customers/Lib/customerList.server', async (original) => {
  const real = await original<typeof import('@/features/customers/Lib/customerList.server')>()
  const { countCursorValue } = await import('@/lib/keyset-count')
  return {
    ...real,
    customerIdsByVehicleCount: vi.fn(
      async (
        organizationId: string,
        params: { search?: string },
        dir: 'asc' | 'desc',
        cursor: { v: (string | number | null)[]; id: string } | null | undefined,
        take: number
      ) => {
        if (cursor) countCursorValue(cursor)
        // The customers the list's own where finds; the SQL's twin of it is
        // pinned and walked against Postgres on its own.
        const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
        const matching = await inMemoryTable(() => customers).findMany({
          where: real.customerListWhere(organizationId, params),
        })
        const ids = matching.map((c: { id: string }) => c.id)
        return countKeysetIds(customers, (c) => c.vehicles.length, {
          organizationId,
          ids,
          dir,
          cursor,
          take,
        })
      }
    ),
  }
})
const auth = vi.hoisted(() => ({ organizationId: 'org-1', permissions: [] as unknown[] }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options?: { requiredPermissions?: unknown[] }
  ) => {
    auth.permissions = options?.requiredPermissions ?? []
    try {
      return { success: true, data: await run({ organizationId: auth.organizationId }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getCustomerRows } from '@/features/customers/Actions/getCustomerRows'

const names = ['Ada Berg', 'Bo Lind', 'Cy Dahl', 'Di Holm']
function makeCustomers(organizationId: string, howMany: number, prefix: string): Customer[] {
  return Array.from({ length: howMany }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    organizationId,
    // Plenty of ties and empty values, so the id has to break them.
    customerNumber: i % 5 === 0 ? null : String(1000 + (i % 40)),
    name: names[i % names.length],
    email: i % 3 === 0 ? null : `c${i % 7}@example.com`,
    phone: i % 4 === 0 ? null : `+47 9${i % 9}`,
    company: i % 2 === 0 ? null : ['Volvo', 'Fjord AS', 'Holm Transport'][i % 3],
    updatedAt: new Date(Date.UTC(2026, 9, 1 + (i % 11), 8)),
    poRequired: i % 6 === 0,
    vehicles: Array.from({ length: i % 4 }, (_, v) => ({ id: `${prefix}v${i}-${v}` })),
  }))
}

beforeEach(() => {
  auth.organizationId = 'org-1'
  customers = [...makeCustomers('org-1', 137, 'a'), ...makeCustomers('org-2', 40, 'b')]
  findMany.mockReset().mockImplementation(table.findMany)
  count.mockReset().mockImplementation(table.count)
})

const walk = (params: Parameters<typeof getCustomerRows>[0]) =>
  walkBatches(getCustomerRows, (cursor) => ({ ...params, cursor }))

const sorts = ['number', 'name', 'company', 'phone', 'email', 'vehicles', undefined]

describe('the customer list, batch by batch', () => {
  for (const sortBy of sorts) {
    for (const sortOrder of ['asc', 'desc'] as const) {
      it(`shows every customer once, in order, sorted by ${sortBy ?? 'last change'} ${sortOrder}`, async () => {
        const { ids, total } = await walk({ sortBy, sortOrder })

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toHaveLength(137)
        expect(total).toBe(137)
        // The order the column promises: the first batch's own orderBy over
        // every row of the workshop (the vehicle count's is Postgres's).
        const orderBy =
          sortBy === 'vehicles'
            ? [{ vehicles: { _count: sortOrder } }, { id: 'asc' }]
            : findMany.mock.calls[0][0].orderBy
        const mine = customers.filter((c) => c.organizationId === 'org-1')
        expect(ids).toEqual(ordered(mine, orderBy).map((c) => c.id))
      })
    }
  }

  it('sends batches of 50 and only counts the list once', async () => {
    await walk({ sortBy: 'name', sortOrder: 'asc' })
    expect(findMany).toHaveBeenCalledTimes(3)
    for (const [args] of findMany.mock.calls) expect(args.take).toBe(51)
    expect(count).toHaveBeenCalledTimes(1)
  })

  it('carries on from the last vehicle count, so a customer deleted above it skips nobody', async () => {
    for (const sortOrder of ['asc', 'desc'] as const) {
      customers = [...makeCustomers('org-1', 137, 'a'), ...makeCustomers('org-2', 40, 'b')]
      const first = await getCustomerRows({ sortBy: 'vehicles', sortOrder })
      const firstIds = first.data?.rows.map((row) => row.id) ?? []
      expect(firstIds).toHaveLength(50)
      // Somebody deletes a customer the first batch already showed.
      customers = customers.filter((c) => c.id !== firstIds[10])

      const after = await walkBatches(getCustomerRows, (cursor) => ({
        sortBy: 'vehicles',
        sortOrder,
        cursor: cursor ?? first.data?.nextCursor,
      }))
      const seen = [...firstIds, ...after.ids]
      const expected = ordered(
        customers.filter((c) => c.organizationId === 'org-1'),
        [{ vehicles: { _count: sortOrder } }, { id: 'asc' }]
      ).map((c) => c.id)
      // Every customer still there, once each, and nothing skipped.
      expect(new Set(seen).size).toBe(seen.length)
      expect(seen.filter((id) => id !== firstIds[10])).toEqual(expected)
    }
  })

  it('keeps to what the search finds, word by word', async () => {
    const { ids, total } = await walk({ search: 'holm transport', sortBy: 'name' })
    const expected = customers.filter(
      (c) =>
        c.organizationId === 'org-1' &&
        [c.name, c.company].some((v) => v?.toLowerCase().includes('holm')) &&
        [c.name, c.company].some((v) => v?.toLowerCase().includes('transport'))
    )
    expect(total).toBe(expected.length)
    expect(ids.sort()).toEqual(expected.map((c) => c.id).sort())
  })

  it('never shows another workshop’s customers', async () => {
    auth.organizationId = 'org-2'
    const { ids } = await walk({ sortBy: 'email', sortOrder: 'desc' })
    expect(ids).toHaveLength(40)
    expect(ids.every((id) => id.startsWith('b'))).toBe(true)
    for (const [args] of findMany.mock.calls) {
      expect(JSON.stringify(args.where)).toContain('"organizationId":"org-2"')
    }
  })

  it('asks for permission to read customers', async () => {
    await getCustomerRows({})
    expect(auth.permissions).toEqual([{ action: 'read', subject: 'customers' }])
  })

  it('refuses a cursor that does not fit the sort', async () => {
    const result = await getCustomerRows({
      sortBy: 'vehicles',
      cursor: { v: ['not a count'], id: 'a001' },
    })
    expect(result.success).toBe(false)
    const keyset = await getCustomerRows({ sortBy: 'name', cursor: { v: [1, 2], id: 'a001' } })
    expect(keyset.success).toBe(false)
  })

  it('hides the PO flag while the workshop has the reference field off', async () => {
    const result = await getCustomerRows({ sortBy: 'name' })
    expect(result.data?.rows.some((row) => row.poRequired)).toBe(false)
  })
})
