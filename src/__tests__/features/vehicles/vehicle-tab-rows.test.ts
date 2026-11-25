/**
 * @vitest-environment node
 *
 * The vehicle page's lists that load more as they scroll: its observations,
 * its notes and (on the classic page) its work orders. Walking each list
 * batch by batch, the way the page does, has to show every row once and in
 * the list's order, keep to its filters, and never show another workshop's
 * rows.
 *
 * Prisma is stood in for by a small in-memory table that answers the
 * where / orderBy / take each action builds the way Postgres would.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any> & { id: string }
type Filter = Record<string, any>

const tables = vi.hoisted(() => ({
  vehicles: [] as { id: string; organizationId: string }[],
  vehicleFinding: [] as Row[],
  note: [] as Row[],
  serviceRecord: [] as Row[],
}))
const auth = vi.hoisted(() => ({ organizationId: 'org-1', options: [] as unknown[] }))

function cmp(a: unknown, b: unknown) {
  const x = a instanceof Date ? a.getTime() : a
  const y = b instanceof Date ? b.getTime() : b
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

function matches(value: Filter | null | undefined, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === 'OR') return (condition as Filter[]).some((f) => matches(value, f))
    if (key === 'AND') return (condition as Filter[]).every((f) => matches(value, f))
    if (value == null) return false
    const field = value[key]
    if (condition === null) return field == null
    if (condition instanceof Date) return field != null && cmp(field, condition) === 0
    if (typeof condition === 'object') {
      if ('in' in condition) return (condition.in as unknown[]).includes(field)
      if ('not' in condition) return field != null
      if ('equals' in condition) return field != null && cmp(field, condition.equals) === 0
      if ('gt' in condition) return field != null && cmp(field, condition.gt) > 0
      if ('lt' in condition) return field != null && cmp(field, condition.lt) < 0
      if ('contains' in condition)
        return (
          typeof field === 'string' &&
          field.toLowerCase().includes(String(condition.contains).toLowerCase())
        )
      return field != null && matches(field, condition)
    }
    return field === condition
  })
}

function order(rows: Row[], orderBy: Filter[]) {
  return [...rows].sort((a, b) => {
    for (const entry of orderBy) {
      const [key, spec] = Object.entries(entry)[0]
      const dir = typeof spec === 'string' ? spec : spec.sort
      const nulls = typeof spec === 'string' ? (dir === 'asc' ? 'last' : 'first') : spec.nulls
      const x = a[key]
      const y = b[key]
      if (x == null && y == null) continue
      if (x == null) return nulls === 'first' ? -1 : 1
      if (y == null) return nulls === 'first' ? 1 : -1
      // A yes/no sorts false before true, as Postgres does.
      const c = cmp(typeof x === 'boolean' ? Number(x) : x, typeof y === 'boolean' ? Number(y) : y)
      if (c !== 0) return dir === 'asc' ? c : -c
    }
    return 0
  })
}

function table(name: 'vehicleFinding' | 'note' | 'serviceRecord') {
  // Rows carry their vehicle, so a filter through the relation can be answered.
  const withVehicle = () =>
    tables[name].map((row) => ({
      ...row,
      vehicle: tables.vehicles.find((v) => v.id === row.vehicleId) ?? null,
    }))
  return {
    findMany: vi.fn(async (args: { where: Filter; orderBy: Filter[]; take: number }) =>
      order(
        withVehicle().filter((row) => matches(row, args.where)),
        args.orderBy
      )
        .slice(0, args.take)
        .map(({ vehicle: _vehicle, ...row }) => row)
    ),
    count: vi.fn(
      async (args: { where: Filter }) =>
        withVehicle().filter((row) => matches(row, args.where)).length
    ),
  }
}

vi.mock('@/lib/db', () => ({
  db: {
    vehicle: {
      findFirst: vi.fn(
        async ({ where }: { where: Filter }) =>
          tables.vehicles.find((v) => matches(v, where)) ?? null
      ),
    },
    vehicleFinding: table('vehicleFinding'),
    note: table('note'),
    serviceRecord: table('serviceRecord'),
  },
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options: unknown
  ) => {
    auth.options.push(options)
    try {
      return { success: true, data: await run({ organizationId: auth.organizationId }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getFindingRows } from '@/features/vehicles/Actions/getFindingRows'
import { getNoteRows } from '@/features/vehicles/Actions/getNoteRows'
import { getVehicleServiceRows } from '@/features/vehicles/Actions/getVehicleServiceRows'
import type { Cursor } from '@/lib/keyset'

type Batch = { rows: Row[]; nextCursor: Cursor | null; total?: number }

/** Every batch of a list, one after the other, as the page asks for them. */
async function walk(fetch: (cursor: Cursor | null) => Promise<{ success: boolean; data?: Batch }>) {
  const ids: string[] = []
  const batches: Batch[] = []
  let cursor: Cursor | null = null
  for (let guard = 0; guard < 50; guard++) {
    const result = await fetch(cursor)
    expect(result.success).toBe(true)
    const batch = result.data as Batch
    batches.push(batch)
    ids.push(...batch.rows.map((row) => row.id))
    if (!batch.nextCursor) break
    // The cursor travels through the browser as JSON.
    cursor = JSON.parse(JSON.stringify(batch.nextCursor))
  }
  return { ids, batches }
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + (n % 40), 9 + (n % 3)))

beforeEach(() => {
  auth.organizationId = 'org-1'
  auth.options = []
  tables.vehicles = [
    { id: 'v1', organizationId: 'org-1' },
    { id: 'v2', organizationId: 'org-1' },
    { id: 'v9', organizationId: 'org-2' },
  ]
  tables.vehicleFinding = []
  tables.note = []
  tables.serviceRecord = []
})

describe("a vehicle's observations", () => {
  beforeEach(() => {
    tables.vehicleFinding = [
      // Plenty of equal dates and statuses, so the id has to break the ties.
      ...Array.from({ length: 133 }, (_, i) => ({
        id: `f${String(i).padStart(3, '0')}`,
        vehicleId: 'v1',
        status: i % 3 === 0 ? 'resolved' : 'open',
        createdAt: day(i),
      })),
      { id: 'other-vehicle', vehicleId: 'v2', status: 'open', createdAt: day(1) },
    ]
  })

  it('shows every one once, open ones first and newest first, in batches of 50', async () => {
    const { ids, batches } = await walk((cursor) => getFindingRows({ vehicleId: 'v1', cursor }))
    const expected = order(
      tables.vehicleFinding.filter((f) => f.vehicleId === 'v1'),
      [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }]
    ).map((f) => f.id)

    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(133)
    expect(batches.map((b) => b.rows.length)).toEqual([50, 50, 33])
    // Only the first batch counts the whole list.
    expect(batches[0].total).toBe(133)
    expect(batches[1].total).toBeUndefined()
  })

  it("shows nothing of another workshop's vehicle", async () => {
    tables.vehicleFinding.push({
      id: 'foreign',
      vehicleId: 'v9',
      status: 'open',
      createdAt: day(1),
    })
    const result = await getFindingRows({ vehicleId: 'v9' })
    expect(result.data).toEqual({ rows: [], nextCursor: null, total: 0 })
  })

  it('asks for the right to read vehicles, and refuses a cursor that does not fit', async () => {
    await getFindingRows({ vehicleId: 'v1' })
    expect(auth.options[0]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'vehicles' }],
    })
    const result = await getFindingRows({ vehicleId: 'v1', cursor: { v: ['open'], id: 'f001' } })
    expect(result.success).toBe(false)
  })
})

describe("a vehicle's notes", () => {
  beforeEach(() => {
    tables.note = [
      ...Array.from({ length: 77 }, (_, i) => ({
        id: `n${String(i).padStart(3, '0')}`,
        vehicleId: 'v1',
        isPinned: i % 9 === 0,
        createdAt: day(i),
      })),
      { id: 'other-vehicle', vehicleId: 'v2', isPinned: true, createdAt: day(2) },
      { id: 'foreign', vehicleId: 'v9', isPinned: true, createdAt: day(2) },
    ]
  })

  it('shows every note once, pinned first and newest first', async () => {
    const { ids, batches } = await walk((cursor) => getNoteRows({ vehicleId: 'v1', cursor }))
    const expected = order(
      tables.note.filter((n) => n.vehicleId === 'v1'),
      [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }]
    ).map((n) => n.id)

    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(77)
    expect(ids.slice(0, 9).every((id) => Number(id.slice(1)) % 9 === 0)).toBe(true)
    expect(batches[0].total).toBe(77)
  })

  it('walks a list that is all pinned or all unpinned just the same', async () => {
    for (const pinned of [true, false]) {
      tables.note = Array.from({ length: 60 }, (_, i) => ({
        id: `n${String(i).padStart(3, '0')}`,
        vehicleId: 'v1',
        isPinned: pinned,
        createdAt: day(i),
      }))
      const { ids } = await walk((cursor) => getNoteRows({ vehicleId: 'v1', cursor }))
      expect(new Set(ids).size).toBe(60)
    }
  })

  it("shows nothing when the vehicle is another workshop's", async () => {
    auth.organizationId = 'org-2'
    const result = await getNoteRows({ vehicleId: 'v1' })
    expect(result.data).toEqual({ rows: [], nextCursor: null, total: 0 })
  })
})

describe("a vehicle's work orders on the classic page", () => {
  beforeEach(() => {
    tables.serviceRecord = [
      ...Array.from({ length: 121 }, (_, i) => ({
        id: `s${String(i).padStart(3, '0')}`,
        vehicleId: 'v1',
        organizationId: 'org-1',
        type: i % 2 === 0 ? 'repair' : 'maintenance',
        title: i % 5 === 0 ? 'Brake pads' : 'Oil change',
        // Imported jobs have no scheduled start.
        startDateTime: i % 4 === 0 ? null : day(i),
        serviceDate: day(i + 3),
      })),
      {
        id: 'other-vehicle',
        vehicleId: 'v2',
        organizationId: 'org-1',
        type: 'repair',
        title: 'Brake pads',
        startDateTime: null,
        serviceDate: day(1),
      },
    ]
  })

  const expectedFor = (keep: (row: Row) => boolean) =>
    order(tables.serviceRecord.filter(keep), [
      { startDateTime: { sort: 'desc', nulls: 'last' } },
      { serviceDate: 'desc' },
      { id: 'asc' },
    ]).map((r) => r.id)

  it('shows every job once, newest first, those without a start last', async () => {
    const { ids, batches } = await walk((cursor) =>
      getVehicleServiceRows({ vehicleId: 'v1', cursor })
    )
    expect(ids).toEqual(expectedFor((r) => r.vehicleId === 'v1'))
    expect(new Set(ids).size).toBe(121)
    expect(batches[0].total).toBe(121)
  })

  it('keeps to the type filter through every batch', async () => {
    const { ids, batches } = await walk((cursor) =>
      getVehicleServiceRows({ vehicleId: 'v1', type: 'repair', cursor })
    )
    expect(ids).toEqual(expectedFor((r) => r.vehicleId === 'v1' && r.type === 'repair'))
    expect(batches[0].total).toBe(61)
  })

  it('keeps to the search, scoped to the workshop and the vehicle', async () => {
    const { ids } = await walk((cursor) =>
      getVehicleServiceRows({ vehicleId: 'v1', search: 'brake', cursor })
    )
    expect(ids).toEqual(expectedFor((r) => r.vehicleId === 'v1' && r.title === 'Brake pads'))
    expect(ids).not.toContain('other-vehicle')
  })

  it('asks for the right to read services', async () => {
    await getVehicleServiceRows({ vehicleId: 'v1' })
    expect(auth.options[0]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'services' }],
    })
  })

  it("shows nothing of another workshop's vehicle", async () => {
    auth.organizationId = 'org-2'
    const result = await getVehicleServiceRows({ vehicleId: 'v1' })
    expect(result.data).toEqual({ rows: [], nextCursor: null, total: 0 })
  })
})
