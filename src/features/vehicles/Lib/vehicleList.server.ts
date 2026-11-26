import { Prisma } from '@/generated/prisma/client'
import { equipmentEnabled } from '@/features/equipment/Lib/equipmentGate.server'
import { equipmentSerialMatch } from '@/features/equipment/Lib/equipmentSearch'
import { fleetNumberMatch, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import { searchYear } from '@/features/vehicles/Lib/searchYear'
import { searchWordsOf, typeKeySearchTerms } from '@/features/vehicles/Lib/typeKey'
import { isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'
import { db } from '@/lib/db'
import { type Cursor, keysetColumn, type KeysetPart } from '@/lib/keyset'
import { containsInsensitive, countKeysetSql } from '@/lib/keyset-count'

/**
 * The vehicle list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const VEHICLE_BATCH_SIZE = 50

export type VehicleListFilters = {
  search?: string
  archived?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** Periodic inspection filter: overdue, or due within this many days. */
  inspectionDue?: 'overdue' | 30 | 90
}

/** The workshop's settings that widen the search: read once per batch. */
export type VehicleSearchOptions = {
  typeKeyOn: boolean
  fleetNumberOn: boolean
  equipmentOn: boolean
}

const NO_SEARCH_OPTIONS: VehicleSearchOptions = {
  typeKeyOn: false,
  fleetNumberOn: false,
  equipmentOn: false,
}

/** The search settings, read only when there is a search to widen. */
export async function vehicleSearchOptions(
  organizationId: string,
  params: Pick<VehicleListFilters, 'search'>
): Promise<VehicleSearchOptions> {
  if (!params.search) return NO_SEARCH_OPTIONS
  const [typeKeyOn, fleetNumberOn, equipmentOn] = await Promise.all([
    isTypeKeyEnabled(organizationId),
    isFleetNumberEnabled(organizationId),
    // A serial number of equipment on the vehicle now finds it, for a
    // workshop that records equipment; off, the query is unchanged.
    equipmentEnabled(organizationId),
  ])
  return { typeKeyOn, fleetNumberOn, equipmentOn }
}

/** The words a search is split into, each of which has to match something. */
function searchWords(params: Pick<VehicleListFilters, 'search'>): string[] {
  return params.search ? searchWordsOf(params.search) : []
}

/** Where the inspection-due filter draws its line, from `now`. */
function inspectionDueBefore(inspectionDue: VehicleListFilters['inspectionDue'], now: Date) {
  if (!inspectionDue) return null
  return inspectionDue === 'overdue' ? now : new Date(now.getTime() + inspectionDue * 86_400_000)
}

/**
 * The list's Prisma `where`. Its twin in SQL is `vehicleListWhereSql`, for the
 * service-count sort: change one and the tests that pin both fail until the
 * other matches.
 */
export function vehicleListWhereWith(
  organizationId: string,
  params: VehicleListFilters,
  options: VehicleSearchOptions,
  now: Date
) {
  const where: any = { organizationId, isArchived: params.archived ?? false }

  const words = searchWords(params)
  const fieldMatch = (word: string) => {
    const conditions: any[] = [
      { make: { contains: word, mode: 'insensitive' } },
      { model: { contains: word, mode: 'insensitive' } },
      { licensePlate: { contains: word, mode: 'insensitive' } },
      { vin: { contains: word, mode: 'insensitive' } },
      ...(options.typeKeyOn ? typeKeySearchTerms(word) : []),
      ...fleetNumberMatch(word, options.fleetNumberOn),
      ...equipmentSerialMatch(organizationId, word, options.equipmentOn),
      { customer: { name: { contains: word, mode: 'insensitive' } } },
    ]
    const year = searchYear(word)
    if (year !== null) conditions.push({ year })
    return conditions
  }
  if (words.length > 1) {
    where.AND = words.map((word: string) => ({ OR: fieldMatch(word) }))
  } else if (words.length === 1) {
    where.OR = fieldMatch(words[0])
  }

  const dueBefore = inspectionDueBefore(params.inspectionDue, now)
  if (dueBefore) where.inspectionStatus = { dueAt: { lt: dueBefore } }

  return where
}

/**
 * `vehicleListWhereWith` in SQL, over the vehicles table as `v`, for the
 * service-count sort. Every condition there has its twin here; the tests pin
 * both (vehicle-count-sql.test.ts) and walk both against Postgres
 * (count-sort.db.test.ts).
 */
export function vehicleListWhereSql(
  organizationId: string,
  params: VehicleListFilters,
  options: VehicleSearchOptions,
  now: Date
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`v."organizationId" = ${organizationId}`,
    Prisma.sql`v."isArchived" = ${params.archived ?? false}`,
  ]

  for (const word of searchWords(params)) {
    const conditions: Prisma.Sql[] = [
      containsInsensitive(Prisma.sql`v."make"`, word),
      containsInsensitive(Prisma.sql`v."model"`, word),
      containsInsensitive(Prisma.sql`v."licensePlate"`, word),
      containsInsensitive(Prisma.sql`v."vin"`, word),
    ]
    if (options.typeKeyOn) {
      for (const term of typeKeySearchTerms(word)) {
        const parts: Prisma.Sql[] = []
        if (term.hsn !== undefined) parts.push(Prisma.sql`v."hsn" = ${term.hsn}`)
        if (term.tsn !== undefined) parts.push(Prisma.sql`v."tsn" = ${term.tsn}`)
        conditions.push(Prisma.sql`(${Prisma.join(parts, ' AND ')})`)
      }
    }
    for (const match of fleetNumberMatch(word, options.fleetNumberOn)) {
      conditions.push(containsInsensitive(Prisma.sql`v."fleetNumber"`, match.fleetNumber.contains))
    }
    for (const match of equipmentSerialMatch(organizationId, word, options.equipmentOn)) {
      const item = match.equipment.some
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "public"."equipment_items" e
        WHERE e."vehicleId" = v."id" AND e."organizationId" = ${item.organizationId}
          AND e."removedAt" IS NULL
          AND ${containsInsensitive(Prisma.sql`e."serialNumber"`, item.serialNumber.contains)}
      )`)
    }
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "public"."customers" cu
      WHERE cu."id" = v."customerId" AND ${containsInsensitive(Prisma.sql`cu."name"`, word)}
    )`)
    const year = searchYear(word)
    if (year !== null) conditions.push(Prisma.sql`v."year" = ${year}`)
    clauses.push(Prisma.sql`(${Prisma.join(conditions, ' OR ')})`)
  }

  const dueBefore = inspectionDueBefore(params.inspectionDue, now)
  if (dueBefore) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "public"."vehicle_inspection_statuses" i
      WHERE i."vehicleId" = v."id" AND i."dueAt" < ${dueBefore}
    )`)
  }

  return Prisma.join(clauses, ' AND ')
}

/**
 * What the list is sorted by, column by column; the id breaks the last tie
 * (lib/keyset.ts adds it).
 *
 * Null for the service count: Prisma can order by a relation's count but not
 * filter on one, so that sort asks Postgres for its ids instead
 * (`vehicleIdsByServiceCount`).
 */
export function vehicleListSort(params: {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  inspectionDue?: unknown
}): KeysetPart[] | null {
  const dir = params.sortOrder || 'desc'
  // A due-date filter reads soonest first unless a column was chosen.
  if (params.inspectionDue && !params.sortBy) {
    return [keysetColumn(['inspectionStatus', 'dueAt'], 'asc', 'date', { nullable: true })]
  }
  switch (params.sortBy) {
    case 'plate':
      return [keysetColumn(['licensePlate'], dir, 'string', { nullable: true, nulls: 'last' })]
    // The column shows "year make model" as one value; sort by make, then
    // model, then year so identical models group together.
    case 'vehicle':
      return [
        keysetColumn(['make'], dir, 'string'),
        keysetColumn(['model'], dir, 'string'),
        keysetColumn(['year'], dir, 'number'),
      ]
    case 'customer':
      return [keysetColumn(['customer', 'name'], dir, 'string')]
    case 'mileage':
      return [keysetColumn(['mileage'], dir, 'number')]
    case 'services':
      return null
    default:
      return [keysetColumn(['updatedAt'], 'desc', 'date')]
  }
}

/**
 * One batch of the service-count sort: the vehicles the list's filters find,
 * after the cursor, most or fewest jobs first and then by id, with each one's
 * count for the next cursor. One query does the filtering, counting, ordering
 * and cutting, so a batch costs the same however long the list is. A job is
 * counted the way the list's `_count` counts it: every job on the vehicle.
 */
export async function vehicleIdsByServiceCount(
  organizationId: string,
  params: VehicleListFilters,
  options: VehicleSearchOptions,
  now: Date,
  cursor: Cursor | null | undefined,
  take: number
): Promise<{ id: string; count: number }[]> {
  const { having, orderBy } = countKeysetSql(
    Prisma.sql`COUNT(s."id")`,
    Prisma.sql`v."id"`,
    params.sortOrder || 'desc',
    cursor
  )
  return db.$queryRaw<{ id: string; count: number }[]>`
    SELECT v."id", COUNT(s."id")::int AS "count"
    FROM "public"."vehicles" v
    LEFT JOIN "public"."service_records" s ON s."vehicleId" = v."id"
    WHERE ${vehicleListWhereSql(organizationId, params, options, now)}
    GROUP BY v."id"
    HAVING ${having}
    ORDER BY ${orderBy}
    LIMIT ${take}
  `
}

export const vehicleListInclude = {
  customer: { select: { id: true, name: true, company: true } },
  inspectionStatus: { select: { dueAt: true, source: true } },
  _count: { select: { serviceRecords: true } },
} as const
