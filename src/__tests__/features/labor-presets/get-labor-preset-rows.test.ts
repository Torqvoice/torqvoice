/**
 * @vitest-environment node
 *
 * The labor packages list loads as it scrolls (getLaborPresetRows). Every
 * package turns up once whatever column it is sorted by, archived ones and
 * other workshops' never do, the search holds for every batch, and reading the
 * list still takes the right to read labor packages.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { ordered, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Preset = {
  id: string
  organizationId: string
  isArchived: boolean
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  _count: { items: number; parts: number }
  items: { hours: number; pricingType: string }[]
}

const state = vi.hoisted(() => ({ presets: [] as Preset[], options: [] as unknown[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return { db: { laborPreset: inMemoryTable(() => state.presets) } }
})
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options?: unknown
  ) => {
    state.options.push(options)
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
}))

import { getLaborPresetRows } from '@/features/labor-presets/Actions/getLaborPresetRows'

const names = ['Brake service', 'Oil change', 'Tyre swap', 'Brake service', 'Timing belt']

function makePresets(): Preset[] {
  return Array.from({ length: 123 }, (_, i) => ({
    id: `p-${String((i * 37) % 123).padStart(3, '0')}`,
    organizationId: i % 11 === 10 ? 'org-2' : 'org-1',
    isArchived: i % 13 === 12,
    // Plenty of ties, so the id has to break them.
    name: names[i % names.length],
    description: i % 4 === 0 ? null : ['Front axle', 'Full synthetic', 'Seasonal'][i % 3],
    createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 9))),
    updatedAt: new Date(Date.UTC(2026, 5, 1, i % 6)),
    _count: { items: 1, parts: 0 },
    items: [{ hours: 1, pricingType: 'hourly' }],
  }))
}

/** What the list should show for this sort, in order, from the same rows. */
function expected(
  sortBy: string,
  dir: 'asc' | 'desc',
  filter: (preset: Preset) => boolean = () => true
) {
  const column = ['name', 'description', 'createdAt'].includes(sortBy) ? sortBy : 'updatedAt'
  const mine = state.presets.filter(
    (p) => p.organizationId === 'org-1' && !p.isArchived && filter(p)
  )
  return ordered(mine, [{ [column]: dir }, { id: 'asc' }]).map((p) => p.id)
}

beforeEach(() => {
  state.presets = makePresets()
  state.options = []
})

describe('the labor packages list in batches', () => {
  for (const sortBy of ['name', 'description', 'createdAt', 'updatedAt']) {
    for (const sortOrder of ['asc', 'desc'] as const) {
      it(`shows every package once, sorted by ${sortBy} ${sortOrder}`, async () => {
        const { ids: seen } = await walkBatches(getLaborPresetRows, (cursor) => ({
          sortBy,
          sortOrder,
          cursor,
        }))
        expect(seen).toEqual(expected(sortBy, sortOrder))
        expect(new Set(seen).size).toBe(seen.length)
      })
    }
  }

  it('starts with 50 and the total, and later batches leave the total out', async () => {
    const first = await getLaborPresetRows({})
    expect(first.data?.rows).toHaveLength(50)
    expect(first.data?.total).toBe(expected('updatedAt', 'desc').length)
    const second = await getLaborPresetRows({ cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
  })

  it('keeps the search on every batch', async () => {
    const { ids: seen } = await walkBatches(getLaborPresetRows, (cursor) => ({
      search: 'brake',
      sortBy: 'name',
      sortOrder: 'asc',
      cursor,
    }))
    expect(seen).toEqual(expected('name', 'asc', (p) => p.name === 'Brake service'))
  })

  it('never shows archived packages or another workshop its packages', async () => {
    const seen = new Set((await walkBatches(getLaborPresetRows, (cursor) => ({ cursor }))).ids)
    const hidden = state.presets.filter((p) => p.isArchived || p.organizationId === 'org-2')
    expect(hidden.length).toBeGreaterThan(0)
    expect(hidden.some((p) => seen.has(p.id))).toBe(false)
  })

  it('takes the right to read labor packages, as the old list did', async () => {
    await getLaborPresetRows({})
    expect(state.options[0]).toEqual({
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.LABOR_PRESETS },
      ],
    })
  })

  it('refuses input that is not a list query', async () => {
    const result = await getLaborPresetRows({ sortOrder: 'sideways' as 'asc' })
    expect(result.success).toBe(false)
  })
})
