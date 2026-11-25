/**
 * @vitest-environment node
 *
 * The work order list carries on from the last row's sort value. A title has
 * no length limit, so when the 50th row's title is a long one, the next batch
 * (and Retry) has to accept it as it is: cut short it would start the next
 * batch in the wrong place, and refused it would end the list at that row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Job = {
  id: string
  organizationId: string
  title: string
  status: string
  serviceDate: Date
  startDateTime: Date | null
  customerReference: string | null
}

let jobs: Job[] = []
const table = inMemoryTable(() => jobs)
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: { serviceRecord: { findMany, count, groupBy: vi.fn(async () => []) } },
}))
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (run: (ctx: { organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getWorkOrderRows } from '@/features/vehicles/Actions/getWorkOrderRows'

const longTitle = `Full service and ${'brake, suspension and electrical check, '.repeat(120)}done`

beforeEach(() => {
  jobs = Array.from({ length: 120 }, (_, i) => ({
    id: `j${String(i).padStart(3, '0')}`,
    organizationId: 'org-1',
    // Titles sort as their number, and row 50 of the first batch is the long one.
    title: i === 49 ? `T049 ${longTitle}` : `T${String(i).padStart(3, '0')} oil change`,
    status: 'in-progress',
    serviceDate: new Date(Date.UTC(2026, 9, 1, 8)),
    startDateTime: null,
    customerReference: null,
  }))
  findMany.mockReset().mockImplementation(table.findMany)
  count.mockReset().mockImplementation(table.count)
})

describe('a long title on the last row of a batch', () => {
  it('carries on past it, showing every job once', async () => {
    expect(longTitle.length).toBeGreaterThan(4000)
    const { ids, batches } = await walkBatches(getWorkOrderRows, (cursor) => ({
      sortBy: 'title',
      sortOrder: 'asc',
      cursor,
    }))
    expect(batches).toBe(3)
    expect(ids).toEqual(jobs.map((job) => job.id))
  })

  it('hands the whole title back in the cursor, not a shortened one', async () => {
    const first = await getWorkOrderRows({ sortBy: 'title', sortOrder: 'asc' })
    expect(first.data?.rows.at(-1)?.id).toBe('j049')
    expect(first.data?.nextCursor?.v).toEqual([`T049 ${longTitle}`])

    // Retry sends the same cursor again and gets the same batch.
    const cursor = first.data?.nextCursor
    const again = await getWorkOrderRows({ sortBy: 'title', sortOrder: 'asc', cursor })
    const retry = await getWorkOrderRows({ sortBy: 'title', sortOrder: 'asc', cursor })
    expect(again.success).toBe(true)
    expect(again.data?.rows[0].id).toBe('j050')
    expect(retry.data?.rows.map((row) => row.id)).toEqual(again.data?.rows.map((row) => row.id))
  })
})
