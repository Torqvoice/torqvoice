import { Prisma } from '@/generated/prisma/client'
import type { Cursor } from '@/lib/keyset'

/**
 * Keyset paging for a list sorted by how many related rows each row has (a
 * customer's vehicles, a vehicle's jobs).
 *
 * Prisma can order by a relation's count but not filter on one, so it cannot
 * ask for "the rows after this count". Paging by position instead skips a row
 * whenever one above the boundary is deleted between batches. These sorts ask
 * Postgres directly for one batch of ids after the last row's count and id,
 * with the list's own filters written out in SQL beside its Prisma `where`
 * (kept in step by the tests that pin both, and by a database test that
 * walks both), and the list then loads those rows through Prisma by id.
 *
 * The cursor is the last row's count and id: `{ v: [count], id }`.
 */

/** The count a cursor carries on from; anything else is refused. */
export function countCursorValue(cursor: Cursor): number {
  const [count] = cursor.v
  if (cursor.v.length !== 1 || typeof count !== 'number' || !Number.isInteger(count) || count < 0)
    throw new Error('Invalid cursor')
  return count
}

/**
 * The HAVING condition and ORDER BY for one batch: the rows strictly after
 * the cursor, by count in `dir` and then by id ascending, as Prisma orders
 * the other sorts. `count` and `id` are code-supplied SQL, never user input;
 * the cursor's values travel as parameters.
 */
export function countKeysetSql(
  count: Prisma.Sql,
  id: Prisma.Sql,
  dir: 'asc' | 'desc',
  cursor: Cursor | null | undefined
): { having: Prisma.Sql; orderBy: Prisma.Sql } {
  const orderBy =
    dir === 'asc' ? Prisma.sql`${count} ASC, ${id} ASC` : Prisma.sql`${count} DESC, ${id} ASC`
  if (!cursor) return { having: Prisma.sql`TRUE`, orderBy }
  const value = countCursorValue(cursor)
  const further = dir === 'asc' ? Prisma.sql`${count} > ${value}` : Prisma.sql`${count} < ${value}`
  return {
    having: Prisma.sql`(${further} OR (${count} = ${value} AND ${id} > ${cursor.id}))`,
    orderBy,
  }
}

/** Rows loaded by id, put back in the order the ids came in. */
export function inIdOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

/**
 * Prisma's `contains` with `mode: 'insensitive'`, the way Prisma 7 sends it
 * to Postgres: `column ILIKE ('%' || term || '%')`, the term as typed. Prisma
 * escapes none of `%`, `_` or `\` in it, so neither does this; a search for
 * "50%" finds the same rows in both. The term travels as a parameter.
 */
export function containsInsensitive(column: Prisma.Sql, term: string): Prisma.Sql {
  return Prisma.sql`${column} ILIKE ('%' || ${term} || '%')`
}
