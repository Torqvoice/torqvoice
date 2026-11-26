/**
 * @vitest-environment node
 *
 * The inventory list loads in batches as it scrolls (getInventoryRows).
 * Walking it batch by batch has to show every part the filters find exactly
 * once, in the order the column says, and only the signed-in workshop's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, ordered, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Part = {
  id: string
  organizationId: string
  isArchived: boolean
  name: string
  partNumber: string | null
  barcode: string | null
  description: string | null
  category: string | null
  quantity: number
  unitCost: number
  sellPrice: number
  supplier: string | null
  location: string | null
  updatedAt: Date
  tags: string[]
}

let parts: Part[] = []
const table = inMemoryTable(() => parts)
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())
const lowIds = vi.hoisted(() => ({ ids: [] as string[] }))

vi.mock('@/lib/db', () => ({
  db: {
    inventoryPart: { findMany, count },
    appSetting: { findFirst: vi.fn(async () => null) },
    $queryRaw: vi.fn(async () => lowIds.ids.map((id) => ({ id }))),
  },
}))
vi.mock('@/features/inventory/Lib/tagSearch.server', () => ({
  partIdsWithTag: vi.fn(async (organizationId: string, tag: string) =>
    parts
      .filter((p) => p.organizationId === organizationId && p.tags.includes(tag))
      .map((p) => p.id)
  ),
  partIdsWithTagContaining: vi.fn(async () => []),
}))
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

import { getInventoryRows } from '@/features/inventory/Actions/getInventoryRows'

function makeParts(organizationId: string, howMany: number, prefix: string): Part[] {
  return Array.from({ length: howMany }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    organizationId,
    isArchived: i % 17 === 0,
    name: ['Oil filter', 'Brake pad', 'Wiper blade', 'Spark plug'][i % 4],
    partNumber: i % 5 === 0 ? null : `PN-${i % 23}`,
    barcode: null,
    description: null,
    category: i % 3 === 0 ? null : ['Filters', 'Brakes'][i % 2],
    quantity: i % 9,
    unitCost: (i % 6) * 12.5,
    sellPrice: (i % 8) * 20,
    supplier: i % 4 === 0 ? null : ['Mekonomen', 'Bilxtra'][i % 2],
    location: i % 7 === 0 ? null : `Shelf ${i % 5}`,
    updatedAt: new Date(Date.UTC(2026, 9, 1 + (i % 13), 8)),
    tags: i % 10 === 0 ? ['Hilux'] : [],
  }))
}

beforeEach(() => {
  auth.organizationId = 'org-1'
  lowIds.ids = []
  parts = [...makeParts('org-1', 163, 'a'), ...makeParts('org-2', 30, 'b')]
  findMany.mockReset().mockImplementation(table.findMany)
  count.mockReset().mockImplementation(table.count)
})

const walk = (params: Parameters<typeof getInventoryRows>[0]) =>
  walkBatches(getInventoryRows, (cursor) => ({ ...params, cursor }))

const live = (organizationId = 'org-1') =>
  parts.filter((p) => p.organizationId === organizationId && !p.isArchived)

const columns = [
  'name',
  'partNumber',
  'category',
  'quantity',
  'unitCost',
  'sellPrice',
  'supplier',
  'location',
  'updatedAt',
]

describe('the inventory list, batch by batch', () => {
  for (const sortBy of columns) {
    for (const sortOrder of ['asc', 'desc'] as const) {
      it(`shows every part once, in order, sorted by ${sortBy} ${sortOrder}`, async () => {
        const { ids, total } = await walk({ sortBy, sortOrder })

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toHaveLength(live().length)
        expect(total).toBe(live().length)
        const orderBy = findMany.mock.calls[0][0].orderBy
        expect(ids).toEqual(ordered(live(), orderBy).map((p) => p.id))
      })
    }
  }

  it('sorts by the last change when asked for a column it does not know', async () => {
    await getInventoryRows({ sortBy: 'userId' })
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }])
  })

  it('keeps to the category, tag and low-stock filters', async () => {
    const filters = await walk({ category: 'Brakes', sortBy: 'name' })
    expect(filters.ids.sort()).toEqual(
      live()
        .filter((p) => p.category === 'Brakes')
        .map((p) => p.id)
        .sort()
    )

    const tagged = await walk({ tag: 'Hilux', sortBy: 'quantity' })
    expect(tagged.ids.sort()).toEqual(
      live()
        .filter((p) => p.tags.includes('Hilux'))
        .map((p) => p.id)
        .sort()
    )

    lowIds.ids = ['a001', 'a002', 'a003']
    const low = await walk({ lowStock: true })
    expect(low.ids.sort()).toEqual(['a001', 'a002', 'a003'])
  })

  it('keeps to what the search finds', async () => {
    const { ids } = await walk({ search: 'oil', sortBy: 'name' })
    expect(ids).toHaveLength(live().filter((p) => p.name === 'Oil filter').length)
  })

  it('never shows another workshop’s parts', async () => {
    auth.organizationId = 'org-2'
    const { ids } = await walk({ sortBy: 'location', sortOrder: 'asc' })
    expect(ids).toHaveLength(live('org-2').length)
    expect(ids.every((id) => id.startsWith('b'))).toBe(true)
  })

  it('asks for permission to read the inventory', async () => {
    await getInventoryRows({})
    expect(auth.permissions).toEqual([{ action: 'read', subject: 'inventory' }])
  })
})
