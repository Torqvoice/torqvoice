/**
 * @vitest-environment node
 *
 * The platform's user and workshop lists load as they scroll (getUserRows,
 * getOrganizationRows). Every account and workshop turns up once whatever the
 * sort, the search holds for every batch, the lists cover the whole platform,
 * and only a super admin may read them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ordered, walkBatches } from '@/__tests__/helpers/in-memory-table'

type Account = {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  emailVerified: boolean
  createdAt: Date
  lastSeen: Date | null
}
type Workshop = {
  id: string
  name: string
  createdAt: Date
  _count: { members: number }
  members: { userId: string }[]
  subscription: null
}

const state = vi.hoisted(() => ({
  users: [] as Account[],
  organizations: [] as Workshop[],
  signedIn: 'admin' as string | null,
}))

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: async () =>
    state.signedIn ? { user: { id: state.signedIn, name: 'A', email: 'a@x' }, session: {} } : null,
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/session-scope', () => ({ sessionOrganizationScope: () => null }))
vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  const users = inMemoryTable(() => state.users)
  return {
    db: {
      user: {
        ...users,
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.users.find((u) => u.id === where.id) ?? null,
      },
      organization: inMemoryTable(() => state.organizations),
      organizationMember: {
        groupBy: async ({ where }: { where: { userId: { in: string[] } } }) =>
          where.userId.in.map((userId) => ({ userId, _count: userId.length % 3 })),
      },
    },
  }
})

import { getOrganizationRows } from '@/features/admin/Actions/getOrganizationRows'
import { getUserRows } from '@/features/admin/Actions/getUserRows'

function makeUsers(): Account[] {
  const users = Array.from({ length: 117 }, (_, i) => ({
    id: `u-${String((i * 31) % 117).padStart(3, '0')}`,
    // Plenty of ties, so the id has to break them.
    name: ['Ann', 'Bo', 'Cy', 'Di'][i % 4],
    email: `person${i}@example.com`,
    isSuperAdmin: i % 9 === 0,
    emailVerified: i % 2 === 0,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 12))),
    // Some never signed in.
    lastSeen: i % 5 === 0 ? null : new Date(Date.UTC(2026, 10, 1, i % 7)),
  }))
  users.push({
    id: 'admin',
    name: 'Admin',
    email: 'admin@example.com',
    isSuperAdmin: true,
    emailVerified: true,
    createdAt: new Date(Date.UTC(2025, 0, 1)),
    lastSeen: null,
  })
  return users
}

function makeOrganizations(): Workshop[] {
  return Array.from({ length: 108 }, (_, i) => ({
    id: `o-${String((i * 29) % 108).padStart(3, '0')}`,
    name: i % 3 === 0 ? `Nordic Motors ${i}` : `Bilverksted ${i}`,
    createdAt: new Date(Date.UTC(2026, 3, 1 + (i % 10))),
    _count: { members: 2 },
    members: [{ userId: 'admin' }],
    subscription: null,
  }))
}

beforeEach(() => {
  state.users = makeUsers()
  state.organizations = makeOrganizations()
  state.signedIn = 'admin'
})

/** The users in the order the list should show them. */
function expectedUsers(sortBy: string, dir: 'asc' | 'desc', filter = (_: Account) => true) {
  const order =
    sortBy === 'lastSeen'
      ? [{ lastSeen: { sort: dir, nulls: 'last' } }, { id: 'asc' }]
      : [{ [sortBy]: dir }, { id: 'asc' }]
  return ordered(state.users.filter(filter), order).map((u) => u.id)
}

describe('the platform user list in batches', () => {
  for (const sortBy of ['name', 'email', 'createdAt', 'lastSeen', 'isSuperAdmin']) {
    for (const sortOrder of ['asc', 'desc'] as const) {
      it(`shows every account once, sorted by ${sortBy} ${sortOrder}`, async () => {
        const { ids: seen } = await walkBatches(getUserRows, (cursor) => ({
          sortBy,
          sortOrder,
          cursor,
        }))
        expect(seen).toEqual(expectedUsers(sortBy, sortOrder))
        expect(new Set(seen).size).toBe(seen.length)
      })
    }
  }

  it('keeps accounts that never signed in at the end, either way round', async () => {
    for (const sortOrder of ['asc', 'desc'] as const) {
      const { ids: seen } = await walkBatches(getUserRows, (cursor) => ({
        sortBy: 'lastSeen',
        sortOrder,
        cursor,
      }))
      const never = state.users.filter((u) => !u.lastSeen).map((u) => u.id)
      expect(new Set(seen.slice(-never.length))).toEqual(new Set(never))
    }
  })

  it('keeps the search on every batch', async () => {
    const { ids: seen } = await walkBatches(getUserRows, (cursor) => ({
      search: 'ann',
      sortBy: 'name',
      sortOrder: 'asc',
      cursor,
    }))
    expect(seen).toEqual(expectedUsers('name', 'asc', (u) => u.name === 'Ann'))
  })

  it('sends the total and the workshop counts with the first batch', async () => {
    const first = await getUserRows({})
    expect(first.data?.rows).toHaveLength(50)
    expect(first.data?.total).toBe(state.users.length)
    expect(typeof first.data?.rows[0].organizationCount).toBe('number')
    const second = await getUserRows({ cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
  })

  it('treats an unknown column as the default sort', async () => {
    const { ids: seen } = await walkBatches(getUserRows, (cursor) => ({
      sortBy: 'password',
      cursor,
    }))
    expect(seen).toEqual(expectedUsers('lastSeen', 'desc'))
  })

  it('is refused to anyone but a super admin', async () => {
    state.signedIn = state.users.find((u) => !u.isSuperAdmin)?.id ?? null
    expect(await getUserRows({})).toEqual({ success: false, error: 'Forbidden' })
    state.signedIn = null
    expect(await getUserRows({})).toEqual({ success: false, error: 'Unauthorized' })
  })
})

describe('the platform workshop list in batches', () => {
  const newestFirst = (filter = (_: Workshop) => true) =>
    ordered(state.organizations.filter(filter), [{ createdAt: 'desc' }, { id: 'asc' }]).map(
      (o) => o.id
    )

  it('shows every workshop once, newest first', async () => {
    const { ids: seen } = await walkBatches(getOrganizationRows, (cursor) => ({ cursor }))
    expect(seen).toEqual(newestFirst())
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('keeps the search on every batch', async () => {
    const { ids: seen } = await walkBatches(getOrganizationRows, (cursor) => ({
      search: 'nordic',
      cursor,
    }))
    expect(seen).toEqual(newestFirst((o) => o.name.startsWith('Nordic')))
  })

  it('names each workshop owner and sends the total with the first batch only', async () => {
    const first = await getOrganizationRows({})
    expect(first.data?.rows[0]).toMatchObject({ ownerEmail: 'admin@example.com', memberCount: 2 })
    expect(first.data?.total).toBe(state.organizations.length)
    const second = await getOrganizationRows({ cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
  })

  it('is refused to anyone but a super admin', async () => {
    state.signedIn = state.users.find((u) => !u.isSuperAdmin)?.id ?? null
    expect(await getOrganizationRows({})).toEqual({ success: false, error: 'Forbidden' })
  })
})
