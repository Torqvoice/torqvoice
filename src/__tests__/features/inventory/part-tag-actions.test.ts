/**
 * Saving and searching part tags through the inventory actions.
 *
 * Two things here would lose a workshop's data quietly if they broke: a save
 * from a page that does not send tags (one opened before tags existed, or a
 * form that never loaded them) must leave the stored tags alone, and a list
 * search must still find a part by its tag although Prisma cannot search
 * inside a text array.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({
  onInventoryChanged: vi.fn(async () => undefined),
}))
vi.mock('@/lib/files/collect', () => ({ inventoryPartFileUrls: vi.fn(async () => []) }))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  parseStoredFileUrl: vi.fn(() => null),
}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (steps: unknown) =>
      Array.isArray(steps) ? Promise.all(steps) : steps
    ),
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    appSetting: { findFirst: vi.fn() },
    inventoryPart: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    storedImage: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  createInventoryPart,
  getInventoryPartsPaginated,
  getInventoryTags,
  updateInventoryPart,
} from '@/features/inventory/Actions/inventoryActions'

const ORG = 'org-a'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.inventoryPart.findMany).mockResolvedValue([])
  vi.mocked(db.inventoryPart.count).mockResolvedValue(0)
})

/** The `data` the part was written with. */
const createdWith = () => vi.mocked(db.inventoryPart.create).mock.calls[0][0].data
// The last write is the part's own fields; an earlier one may be the gallery's
// main image, which an update rewrites in its own step.
const updatedWith = () => vi.mocked(db.inventoryPart.updateMany).mock.calls.at(-1)![0].data

describe('saving tags', () => {
  it('stores a new part’s tags cleaned, without a repeat in another case', async () => {
    vi.mocked(db.inventoryPart.create).mockResolvedValue({ id: 'p1', name: 'Fuel filter' } as never)

    const result = await createInventoryPart({
      name: 'Fuel filter',
      tags: ['  Toyota ', 'toyota', 'Hilux   2015-2020', ''],
    })

    expect(result.success).toBe(true)
    expect(createdWith().tags).toEqual(['Toyota', 'Hilux 2015-2020'])
  })

  it('gives a part created without tags none', async () => {
    vi.mocked(db.inventoryPart.create).mockResolvedValue({ id: 'p1', name: 'Fuel filter' } as never)
    await createInventoryPart({ name: 'Fuel filter' })
    expect(createdWith().tags).toEqual([])
  })

  it('leaves the stored tags alone when an update does not send any', async () => {
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({ id: 'p1' } as never)
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as never)

    await updateInventoryPart({ id: 'p1', name: 'Fuel filter (new)' })

    expect(updatedWith().name).toBe('Fuel filter (new)')
    expect(updatedWith().tags).toBeUndefined()
  })

  it('clears the tags when an update sends an empty list', async () => {
    vi.mocked(db.inventoryPart.findFirst).mockResolvedValue({ id: 'p1' } as never)
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as never)

    await updateInventoryPart({ id: 'p1', tags: [] })

    expect(updatedWith().tags).toEqual([])
  })

  it('refuses a tag longer than the limit rather than cutting it', async () => {
    const result = await createInventoryPart({ name: 'Fuel filter', tags: ['x'.repeat(41)] })
    expect(result.success).toBe(false)
    expect(db.inventoryPart.create).not.toHaveBeenCalled()
  })
})

describe('searching and filtering by tag', () => {
  it('finds parts whose tag holds a searched word, alongside the other fields', async () => {
    // The SQL lookup answers which parts carry a tag with "hilux" in it.
    vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'fuel' }])

    await getInventoryPartsPaginated({ search: 'hilux' })

    const where = vi.mocked(db.inventoryPart.findMany).mock.calls[0][0]!.where!
    expect(where.organizationId).toBe(ORG)
    expect(where.AND).toEqual([
      {
        OR: expect.arrayContaining([
          { name: { contains: 'hilux', mode: 'insensitive' } },
          { id: { in: ['fuel'] } },
        ]),
      },
    ])
  })

  it('needs every searched word to match, each on its own', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'fuel' }])

    await getInventoryPartsPaginated({ search: 'filter  hilux' })

    const where = vi.mocked(db.inventoryPart.findMany).mock.calls[0][0]!.where!
    expect(where.AND).toHaveLength(2)
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('limits the list to the parts carrying the chosen tag', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'fuel' }, { id: 'oil' }])

    await getInventoryPartsPaginated({ tag: 'Toyota' })

    const where = vi.mocked(db.inventoryPart.findMany).mock.calls[0][0]!.where!
    expect(where.AND).toEqual([{ id: { in: ['fuel', 'oil'] } }])
  })

  it('lists each of the workshop’s tags once for the filter', async () => {
    vi.mocked(db.inventoryPart.findMany).mockResolvedValue([
      { tags: ['Toyota', 'Hilux'] },
      { tags: ['toyota'] },
      { tags: ['Toyota', 'Ranger'] },
    ] as never)

    const result = await getInventoryTags()

    expect(result.data).toEqual(['Hilux', 'Ranger', 'Toyota'])
    expect(vi.mocked(db.inventoryPart.findMany).mock.calls[0][0]!.where).toEqual(
      expect.objectContaining({ organizationId: ORG })
    )
  })
})
