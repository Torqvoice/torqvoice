/**
 * @vitest-environment node
 *
 * Sorting the work order list by what the customer was told.
 *
 * "What are we late on" is the question the promise exists to answer, and on
 * a list of twenty rows a page it can only be answered by ordering the whole
 * table in the database. Two things have to hold: the column sorts by
 * `promisedAt`, and a job nobody promised sorts to the end rather than
 * crowding the top as an empty value.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.hoisted(() =>
  vi.fn(
    async (_args: { orderBy: unknown; where: Record<string, unknown> }): Promise<unknown[]> => []
  )
)
vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: {
      findMany,
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
  },
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (run: (ctx: { organizationId: string }) => Promise<unknown>) => ({
    success: true,
    data: await run({ organizationId: 'org-1' }),
  }),
}))

import { getWorkOrders } from '@/features/vehicles/Actions/serviceActions'

/** The where the list's query was built with. */
async function whereFor(params: Parameters<typeof getWorkOrders>[0]) {
  findMany.mockClear()
  await getWorkOrders(params)
  return findMany.mock.calls[0]?.[0].where
}

/** The orderBy the list's query was built with. */
async function orderByFor(sortBy: string, sortOrder: 'asc' | 'desc' = 'desc') {
  return (await whereForOrder({ sortBy, sortOrder })) as unknown
}

async function whereForOrder(params: Parameters<typeof getWorkOrders>[0]) {
  findMany.mockClear()
  await getWorkOrders(params)
  return findMany.mock.calls[0]?.[0].orderBy
}

beforeEach(() => {
  findMany.mockClear()
})

describe('the promised column', () => {
  it('sorts by the promise, soonest first when ascending', async () => {
    expect(await orderByFor('promisedAt', 'asc')).toEqual({
      promisedAt: { sort: 'asc', nulls: 'last' },
    })
  })

  it('keeps jobs with no promise at the end, whichever way it is sorted', async () => {
    // Ascending they would otherwise lead the list, and the answer to "what is
    // promised soonest" would be a page of jobs nobody promised anything.
    for (const direction of ['asc', 'desc'] as const) {
      expect(await orderByFor('promisedAt', direction)).toMatchObject({
        promisedAt: { nulls: 'last' },
      })
    }
  })

  it('leaves the other columns as they were', async () => {
    expect(await orderByFor('totalAmount', 'desc')).toEqual({ totalAmount: 'desc' })
    // The default is still the date the job is presented with.
    expect(await orderByFor('serviceDate', 'desc')).toEqual([
      { startDateTime: { sort: 'desc', nulls: 'last' } },
      { serviceDate: 'desc' },
    ])
  })
})

/**
 * The "Due today" filter: what the workshop owes a customer by tonight.
 *
 * Late jobs belong to the same answer, since they were due before today and
 * are still owed, and a finished job is owed to nobody. "Today" has to be the
 * workshop's own day: read in the server's zone, a shop far enough east loses
 * its evening from the list, which is exactly the hours it would be working
 * through the promises.
 */
describe('the due today filter', () => {
  it('asks for promises made for today or earlier, on jobs not finished', async () => {
    const where = (await whereFor({ due: 'today' })) as {
      promisedAt: { not: null; lte: Date }
      AND: { status: { not: string } }[]
    }

    expect(where.promisedAt.not).toBeNull()
    expect(where.AND).toEqual([{ status: { not: 'completed' } }])
    // End of today in Auckland, which is not end of today in UTC.
    const end = where.promisedAt.lte
    expect(end.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000)
    const inZone = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Pacific/Auckland',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(end)
    expect(inZone).toBe('23:59')
  })

  it('leaves the list alone when it is not asked for', async () => {
    const where = (await whereFor({})) as Record<string, unknown>
    expect(where.promisedAt).toBeUndefined()
    expect(where.AND).toBeUndefined()
  })

  it('still honours the status tab it is combined with', async () => {
    const where = (await whereFor({ due: 'today', status: 'waiting-parts' })) as Record<
      string,
      unknown
    >
    expect(where.status).toBe('waiting-parts')
    expect(where.AND).toEqual([{ status: { not: 'completed' } }])
  })
})
