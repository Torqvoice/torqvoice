import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { type Cursor, keysetColumn, type KeysetPart } from '@/lib/keyset'
import { containsInsensitive, countKeysetSql } from '@/lib/keyset-count'

/**
 * The customer list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const CUSTOMER_BATCH_SIZE = 50

export type CustomerListFilters = {
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

const FIELDS = ['name', 'email', 'phone', 'company', 'customerNumber'] as const

export function customerListWhere(organizationId: string, params: CustomerListFilters) {
  const where: any = { organizationId }
  const search = params.search?.trim()
  if (!search) return where

  // Every word has to match some field, in any order: "berg volvo" finds Ada
  // Berg at Volvo.
  const words = search.split(/\s+/).filter(Boolean)
  const anyField = (word: string) =>
    FIELDS.map((field) => ({ [field]: { contains: word, mode: 'insensitive' } }))
  if (words.length > 1) where.AND = words.map((word) => ({ OR: anyField(word) }))
  else where.OR = anyField(search)
  return where
}

/**
 * How the list is sorted. Most columns are a keyset on the column and the id
 * (lib/keyset.ts). The vehicle count is not a column Prisma can compare
 * against, so that sort carries on from the last row's count and id through
 * Postgres instead (`customerIdsByVehicleCount`).
 */
export type CustomerListSort =
  | { kind: 'keyset'; parts: KeysetPart[] }
  | { kind: 'vehicleCount'; dir: 'asc' | 'desc' }

export function customerListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): CustomerListSort {
  const dir = sortOrder || 'desc'
  const nullsLast = (column: string) =>
    keysetColumn([column], dir, 'string', { nullable: true, nulls: 'last' })
  switch (sortBy) {
    case 'number':
      return { kind: 'keyset', parts: [nullsLast('customerNumber')] }
    case 'name':
      return { kind: 'keyset', parts: [keysetColumn(['name'], dir, 'string')] }
    case 'company':
    case 'phone':
    case 'email':
      return { kind: 'keyset', parts: [nullsLast(sortBy)] }
    case 'vehicles':
      return { kind: 'vehicleCount', dir }
    default:
      // Most recently touched first, whatever the direction asked for.
      return { kind: 'keyset', parts: [keysetColumn(['updatedAt'], 'desc', 'date')] }
  }
}

/**
 * `customerListWhere` in SQL, for the vehicle-count sort, over the customers
 * table as `c`. Every condition there has its twin here; the tests pin both
 * (customer-count-sql.test.ts) and walk both against Postgres
 * (count-sort.db.test.ts), so a filter added to one and not the other fails.
 */
export function customerListWhereSql(organizationId: string, params: CustomerListFilters) {
  const clauses: Prisma.Sql[] = [Prisma.sql`c."organizationId" = ${organizationId}`]
  const search = params.search?.trim()
  if (search) {
    // Every word has to match some field, as in customerListWhere.
    for (const word of search.split(/\s+/).filter(Boolean)) {
      const fields = FIELDS.map((field) => containsInsensitive(Prisma.raw(`c."${field}"`), word))
      clauses.push(Prisma.sql`(${Prisma.join(fields, ' OR ')})`)
    }
  }
  return Prisma.join(clauses, ' AND ')
}

/**
 * One batch of the vehicle-count sort: the customers the list's filters find,
 * after the cursor, most or fewest vehicles first and then by id, with each
 * one's count for the next cursor. One query does the filtering, counting,
 * ordering and cutting, so a batch costs the same however long the list is.
 * A vehicle is counted the way the list's `_count` counts it: every vehicle
 * of the customer, archived ones too.
 */
export async function customerIdsByVehicleCount(
  organizationId: string,
  params: CustomerListFilters,
  dir: 'asc' | 'desc',
  cursor: Cursor | null | undefined,
  take: number
): Promise<{ id: string; count: number }[]> {
  const { having, orderBy } = countKeysetSql(
    Prisma.sql`COUNT(v."id")`,
    Prisma.sql`c."id"`,
    dir,
    cursor
  )
  return db.$queryRaw<{ id: string; count: number }[]>`
    SELECT c."id", COUNT(v."id")::int AS "count"
    FROM "public"."customers" c
    LEFT JOIN "public"."vehicles" v ON v."customerId" = c."id"
    WHERE ${customerListWhereSql(organizationId, params)}
    GROUP BY c."id"
    HAVING ${having}
    ORDER BY ${orderBy}
    LIMIT ${take}
  `
}

export const customerListInclude = {
  _count: { select: { vehicles: true } },
} as const
