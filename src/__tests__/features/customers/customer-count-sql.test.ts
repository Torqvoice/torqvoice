/**
 * @vitest-environment node
 *
 * The customer list sorted by vehicle count reads its batches in SQL, with
 * the list's filters written out a second time beside the Prisma `where`
 * every other sort uses. If the two drift apart, that sort shows a different
 * list from the rest. These pins hold both side by side for every filter, so
 * a change to one fails here until the other matches; the database test
 * (src/__tests__/db/count-sort.db.test.ts) walks both against Postgres.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import {
  type CustomerListFilters,
  customerListWhere,
  customerListWhereSql,
} from '@/features/customers/Lib/customerList.server'

const FIELDS = ['name', 'email', 'phone', 'company', 'customerNumber']

/** One word in any field, in Prisma. */
const anyField = (word: string) =>
  FIELDS.map((field) => ({ [field]: { contains: word, mode: 'insensitive' } }))

/** The same in SQL: Prisma's own ILIKE, the word a parameter (`?`) per field. */
const anyFieldSql = `(${FIELDS.map((f) => `c."${f}" ILIKE ('%' || ? || '%')`).join(' OR ')})`

function both(params: CustomerListFilters) {
  const sql = customerListWhereSql('org-1', params)
  return {
    prisma: customerListWhere('org-1', params),
    sql: sql.sql.replace(/\s+/g, ' ').trim(),
    values: sql.values,
  }
}

describe('the customer filters, in Prisma and in SQL', () => {
  it('no search: the workshop only', () => {
    expect(both({})).toEqual({
      prisma: { organizationId: 'org-1' },
      sql: 'c."organizationId" = ?',
      values: ['org-1'],
    })
    // Spaces alone are no search.
    expect(both({ search: '   ' })).toEqual(both({}))
  })

  it('one word: any field', () => {
    expect(both({ search: ' berg ' })).toEqual({
      prisma: { organizationId: 'org-1', OR: anyField('berg') },
      sql: `c."organizationId" = ? AND ${anyFieldSql}`,
      values: ['org-1', ...FIELDS.map(() => 'berg')],
    })
  })

  it('several words: each in some field', () => {
    expect(both({ search: 'berg  volvo' })).toEqual({
      prisma: {
        organizationId: 'org-1',
        AND: [{ OR: anyField('berg') }, { OR: anyField('volvo') }],
      },
      sql: `c."organizationId" = ? AND ${anyFieldSql} AND ${anyFieldSql}`,
      values: ['org-1', ...FIELDS.map(() => 'berg'), ...FIELDS.map(() => 'volvo')],
    })
  })

  it('a word with LIKE wildcards in it goes as typed, as Prisma sends it', () => {
    // Prisma 7 puts `contains` in ILIKE ('%' || $n || '%') and escapes
    // nothing, so `%`, `_` and `\` act as wildcards there; here too.
    const word = '50%_a\\b'
    expect(both({ search: word })).toEqual({
      prisma: { organizationId: 'org-1', OR: anyField(word) },
      sql: `c."organizationId" = ? AND ${anyFieldSql}`,
      values: ['org-1', ...FIELDS.map(() => word)],
    })
  })

  it('the sort and its direction filter nothing', () => {
    expect(both({ search: 'berg', sortBy: 'vehicles', sortOrder: 'asc' })).toEqual(
      both({ search: 'berg' })
    )
  })
})
