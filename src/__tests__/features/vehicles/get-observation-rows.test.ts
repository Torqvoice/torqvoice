/**
 * @vitest-environment node
 *
 * The observations list loads in batches as it scrolls (getObservationRows).
 * Every finding the filters keep shows exactly once, open ones before
 * resolved and the newest first within each, and only findings on the
 * signed-in workshop's vehicles. With no status asked for it shows the open
 * ones, which is what the status dropdown says.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Finding = {
  id: string
  description: string
  notes: string | null
  severity: string
  status: string
  createdAt: Date
  vehicle: { organizationId: string; make: string; model: string; licensePlate: string | null }
}

let findings: Finding[] = []
const table = inMemoryTable(() => findings)
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({ db: { vehicleFinding: { findMany, count } } }))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({ typeKeySearch: vi.fn(async () => []) }))
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

import { getObservationRows } from '@/features/vehicles/Actions/getObservationRows'

function makeFindings(organizationId: string, howMany: number, prefix: string): Finding[] {
  return Array.from({ length: howMany }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    description: ['Worn brake pads', 'Oil leak', 'Cracked windscreen'][i % 3],
    notes: i % 4 === 0 ? 'Customer informed' : null,
    severity: ['urgent', 'needs_work', 'monitor'][i % 3],
    status: i % 5 === 0 ? 'resolved' : 'open',
    // Several found on the same day.
    createdAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 3), 9)),
    vehicle: {
      organizationId,
      make: ['Volvo', 'Toyota'][i % 2],
      model: ['V70', 'Hilux'][i % 2],
      licensePlate: i % 6 === 0 ? null : `EL ${10000 + i}`,
    },
  }))
}

beforeEach(() => {
  auth.organizationId = 'org-1'
  findings = [...makeFindings('org-1', 133, 'a'), ...makeFindings('org-2', 20, 'b')]
  findMany.mockReset().mockImplementation(table.findMany)
  count.mockReset().mockImplementation(table.count)
})

const walk = (params: Parameters<typeof getObservationRows>[0]) =>
  walkBatches(getObservationRows, (cursor) => ({ ...params, cursor }))

const mine = (organizationId = 'org-1') =>
  findings.filter((f) => f.vehicle.organizationId === organizationId)

describe('the observations list, batch by batch', () => {
  it('shows every finding once, open first and newest first within each', async () => {
    const { ids, total } = await walk({ status: 'all' })

    expect(total).toBe(133)
    expect(new Set(ids).size).toBe(133)
    const expected = mine()
      .sort(
        (x, y) =>
          (x.status < y.status ? -1 : x.status > y.status ? 1 : 0) ||
          y.createdAt.getTime() - x.createdAt.getTime() ||
          (x.id < y.id ? -1 : 1)
      )
      .map((f) => f.id)
    expect(ids).toEqual(expected)
  })

  it('shows only open findings when no status is asked for, as the dropdown says', async () => {
    const open = mine()
      .filter((f) => f.status === 'open')
      .map((f) => f.id)
      .sort()
    const { ids, total } = await walk({})
    expect(total).toBe(open.length)
    expect(ids.sort()).toEqual(open)
    // The same list every batch, and the same as asking for "open" outright.
    expect((await walk({ status: 'open' })).ids.sort()).toEqual(open)
  })

  it('keeps to the status and severity filters', async () => {
    const { ids } = await walk({ status: 'open', severity: 'urgent' })
    expect(ids.sort()).toEqual(
      mine()
        .filter((f) => f.status === 'open' && f.severity === 'urgent')
        .map((f) => f.id)
        .sort()
    )
    // "all" is no filter at all.
    expect((await walk({ status: 'all', severity: 'all' })).ids).toHaveLength(133)
  })

  it('keeps to what the search finds', async () => {
    const { ids } = await walk({ status: 'all', search: 'hilux' })
    expect(ids.sort()).toEqual(
      mine()
        .filter((f) => f.vehicle.model === 'Hilux')
        .map((f) => f.id)
        .sort()
    )
  })

  it('never shows findings on another workshop’s vehicles', async () => {
    auth.organizationId = 'org-2'
    const { ids } = await walk({ status: 'all' })
    expect(ids).toHaveLength(20)
    expect(ids.every((id) => id.startsWith('b'))).toBe(true)
  })

  it('asks for permission to read vehicles, as the list always has', async () => {
    await getObservationRows({})
    expect(auth.permissions).toEqual([{ action: 'read', subject: 'vehicles' }])
  })
})
