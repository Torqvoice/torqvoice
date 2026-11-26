/**
 * @vitest-environment node
 *
 * A part's stock history loads in batches as it scrolls
 * (getStockMovementRows). Every movement of that part shows exactly once,
 * newest first, only the signed-in workshop's, and each with its time written
 * on the workshop's clock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Movement = {
  id: string
  organizationId: string
  inventoryPartId: string
  delta: number
  quantityAfter: number
  reason: string
  note: string | null
  createdAt: Date
  serviceRecordLabel: string | null
  user: { name: string } | null
  serviceRecord: null
}

let movements: Movement[] = []
const table = inMemoryTable(() => movements)
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({ db: { stockMovement: { findMany, count } } }))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopDateSettings: vi.fn(async () => ({
    timeZone: 'Pacific/Auckland',
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
  })),
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

import { getStockMovementRows } from '@/features/inventory/Actions/getStockMovementRows'

const reasons = ['service_record', 'manual_adjustment', 'quote_conversion']
function makeMovements(organizationId: string, partId: string, howMany: number, prefix: string) {
  return Array.from({ length: howMany }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    organizationId,
    inventoryPartId: partId,
    delta: i % 2 ? -1 : 4,
    quantityAfter: i,
    reason: reasons[i % 3],
    note: null,
    // Several movements in the same instant, as a job saving many lines makes.
    createdAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 4), 23, 30)),
    serviceRecordLabel: null,
    user: { name: 'Kari' },
    serviceRecord: null,
  }))
}

beforeEach(() => {
  auth.organizationId = 'org-1'
  movements = [
    ...makeMovements('org-1', 'part-1', 121, 'a'),
    ...makeMovements('org-1', 'part-2', 9, 'c'),
    // Another workshop's movements under the same part id.
    ...makeMovements('org-2', 'part-1', 12, 'b'),
  ]
  findMany.mockReset().mockImplementation(table.findMany)
  count.mockReset().mockImplementation(table.count)
})

const walk = (params: Omit<Parameters<typeof getStockMovementRows>[0], 'cursor'>) =>
  walkBatches(getStockMovementRows, (cursor) => ({ ...params, cursor }))

describe('a part’s stock history, batch by batch', () => {
  it('shows every movement of the part once, newest first', async () => {
    const { ids, total } = await walk({ inventoryPartId: 'part-1' })

    expect(total).toBe(121)
    expect(ids).toHaveLength(121)
    expect(new Set(ids).size).toBe(121)
    const expected = movements
      .filter((m) => m.organizationId === 'org-1' && m.inventoryPartId === 'part-1')
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? -1 : 1))
      .map((m) => m.id)
    expect(ids).toEqual(expected)
  })

  it('keeps to the reason, and ignores one it does not know', async () => {
    const used = await walk({ inventoryPartId: 'part-1', reason: 'service_record' })
    expect(used.ids).toHaveLength(41)

    const unknown = await walk({ inventoryPartId: 'part-1', reason: 'teleported' })
    expect(unknown.ids).toHaveLength(121)
  })

  it('never shows another workshop’s movements, even for the same part id', async () => {
    auth.organizationId = 'org-2'
    const { ids } = await walk({ inventoryPartId: 'part-1' })
    expect(ids).toHaveLength(12)
    expect(ids.every((id) => id.startsWith('b'))).toBe(true)
  })

  it('writes the time on the workshop’s clock', async () => {
    const result = await getStockMovementRows({ inventoryPartId: 'part-2' })
    const first = result.data?.rows.find((row) => row.id === 'c000')
    // 23:30 UTC on 1 October is 12:30 the next day in Auckland.
    expect(first?.createdAtLabel).toBe('2026-10-02 12:30')
  })

  it('asks for permission to read the inventory', async () => {
    await getStockMovementRows({ inventoryPartId: 'part-1' })
    expect(auth.permissions).toEqual([{ action: 'read', subject: 'inventory' }])
  })
})
