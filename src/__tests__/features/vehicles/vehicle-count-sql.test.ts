/**
 * @vitest-environment node
 *
 * The vehicle list sorted by job count reads its batches in SQL, with the
 * list's filters written out a second time beside the Prisma `where` every
 * other sort uses. If the two drift apart, that sort shows a different list
 * from the rest. These pins hold both side by side for every filter and every
 * setting that widens the search, so a change to one fails here until the
 * other matches; the database test (src/__tests__/db/count-sort.db.test.ts)
 * walks both against Postgres.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import {
  type VehicleListFilters,
  type VehicleSearchOptions,
  vehicleListWhereSql,
  vehicleListWhereWith,
} from '@/features/vehicles/Lib/vehicleList.server'

const NOW = new Date('2026-11-25T12:00:00.000Z')
const OFF: VehicleSearchOptions = { typeKeyOn: false, fleetNumberOn: false, equipmentOn: false }
const ON: VehicleSearchOptions = { typeKeyOn: true, fleetNumberOn: true, equipmentOn: true }

function both(params: VehicleListFilters, options: VehicleSearchOptions = OFF) {
  const sql = vehicleListWhereSql('org-1', params, options, NOW)
  return {
    prisma: vehicleListWhereWith('org-1', params, options, NOW),
    sql: sql.sql.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim(),
    values: sql.values,
  }
}

// Prisma's `contains` with mode insensitive, and the ILIKE Prisma sends for it.
const contains = (word: string) => ({ contains: word, mode: 'insensitive' })
const like = (column: string) => `${column} ILIKE ('%' || ? || '%')`

const BASE = 'v."organizationId" = ? AND v."isArchived" = ?'
const COLUMNS = ['make', 'model', 'licensePlate', 'vin']
const columnsSql = COLUMNS.map((c) => like(`v."${c}"`)).join(' OR ')
const customerSql = `EXISTS (SELECT 1 FROM "public"."customers" cu WHERE cu."id" = v."customerId" AND ${like('cu."name"')})`
const equipmentSql = `EXISTS (SELECT 1 FROM "public"."equipment_items" e WHERE e."vehicleId" = v."id" AND e."organizationId" = ? AND e."removedAt" IS NULL AND ${like('e."serialNumber"')})`
const dueSql = `EXISTS (SELECT 1 FROM "public"."vehicle_inspection_statuses" i WHERE i."vehicleId" = v."id" AND i."dueAt" < ?)`

const columns = (word: string) => COLUMNS.map((c) => ({ [c]: contains(word) }))
const customer = (word: string) => ({ customer: { name: contains(word) } })
const equipment = (word: string) => ({
  equipment: {
    some: { organizationId: 'org-1', removedAt: null, serialNumber: contains(word) },
  },
})
const words = (word: string, n: number) => Array.from({ length: n }, () => word)

describe('the vehicle filters, in Prisma and in SQL', () => {
  it('no filter: the workshop, not archived', () => {
    expect(both({})).toEqual({
      prisma: { organizationId: 'org-1', isArchived: false },
      sql: BASE,
      values: ['org-1', false],
    })
    expect(both({ search: '  ' })).toEqual(both({}))
  })

  it('archived', () => {
    expect(both({ archived: true })).toEqual({
      prisma: { organizationId: 'org-1', isArchived: true },
      sql: BASE,
      values: ['org-1', true],
    })
  })

  it('one word, every widening setting off', () => {
    expect(both({ search: 'volvo' })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns('volvo'), customer('volvo')],
      },
      sql: `${BASE} AND (${columnsSql} OR ${customerSql})`,
      values: ['org-1', false, ...words('volvo', 5)],
    })
  })

  it('several words, one a year; the lone separator is dropped', () => {
    expect(both({ search: 'volvo / 2012' })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        AND: [
          { OR: [...columns('volvo'), customer('volvo')] },
          { OR: [...columns('2012'), customer('2012'), { year: 2012 }] },
        ],
      },
      sql: `${BASE} AND (${columnsSql} OR ${customerSql}) AND (${columnsSql} OR ${customerSql} OR v."year" = ?)`,
      values: ['org-1', false, ...words('volvo', 5), ...words('2012', 5), 2012],
    })
  })

  it('a word with LIKE wildcards in it goes as typed, as Prisma sends it', () => {
    // Prisma 7 puts `contains` in ILIKE ('%' || $n || '%') and escapes
    // nothing, so `%`, `_` and `\` act as wildcards there; here too.
    const word = '50%_a\\b'
    expect(both({ search: word })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns(word), customer(word)],
      },
      sql: `${BASE} AND (${columnsSql} OR ${customerSql})`,
      values: ['org-1', false, ...words(word, 5)],
    })
  })

  it('every widening setting on: a type key pair, a fleet number, an equipment serial', () => {
    const word = '0603BFQ'
    expect(both({ search: word }, ON)).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [
          ...columns(word),
          { hsn: '0603', tsn: 'BFQ' },
          { fleetNumber: contains(word) },
          equipment(word),
          customer(word),
        ],
      },
      sql: `${BASE} AND (${columnsSql} OR (v."hsn" = ? AND v."tsn" = ?) OR ${like('v."fleetNumber"')} OR ${equipmentSql} OR ${customerSql})`,
      values: ['org-1', false, ...words(word, 4), '0603', 'BFQ', word, 'org-1', word, word],
    })
  })

  it('a type key half: the HSN (also a year) and the TSN', () => {
    expect(both({ search: '0603' }, { ...OFF, typeKeyOn: true })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns('0603'), { hsn: '0603' }, customer('0603'), { year: 603 }],
      },
      sql: `${BASE} AND (${columnsSql} OR (v."hsn" = ?) OR ${customerSql} OR v."year" = ?)`,
      values: ['org-1', false, ...words('0603', 4), '0603', '0603', 603],
    })
    expect(both({ search: 'BFQ' }, { ...OFF, typeKeyOn: true })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns('BFQ'), { tsn: 'BFQ' }, customer('BFQ')],
      },
      sql: `${BASE} AND (${columnsSql} OR (v."tsn" = ?) OR ${customerSql})`,
      values: ['org-1', false, ...words('BFQ', 4), 'BFQ', 'BFQ'],
    })
  })

  it('the fleet number alone, and the equipment serial alone', () => {
    expect(both({ search: 'u12' }, { ...OFF, fleetNumberOn: true })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns('u12'), { fleetNumber: contains('u12') }, customer('u12')],
      },
      sql: `${BASE} AND (${columnsSql} OR ${like('v."fleetNumber"')} OR ${customerSql})`,
      values: ['org-1', false, ...words('u12', 6)],
    })
    expect(both({ search: 'sn-9' }, { ...OFF, equipmentOn: true })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        OR: [...columns('sn-9'), equipment('sn-9'), customer('sn-9')],
      },
      sql: `${BASE} AND (${columnsSql} OR ${equipmentSql} OR ${customerSql})`,
      values: ['org-1', false, ...words('sn-9', 4), 'org-1', 'sn-9', 'sn-9'],
    })
  })

  it.each(['overdue', 30, 90] as const)('inspection due: %s', (inspectionDue) => {
    const before =
      inspectionDue === 'overdue' ? NOW : new Date(NOW.getTime() + inspectionDue * 86_400_000)
    expect(both({ inspectionDue })).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: false,
        inspectionStatus: { dueAt: { lt: before } },
      },
      sql: `${BASE} AND ${dueSql}`,
      values: ['org-1', false, before],
    })
  })

  it('every filter at once', () => {
    const before = new Date(NOW.getTime() + 30 * 86_400_000)
    expect(both({ search: 'volvo', archived: true, inspectionDue: 30 }, ON)).toEqual({
      prisma: {
        organizationId: 'org-1',
        isArchived: true,
        OR: [
          ...columns('volvo'),
          { fleetNumber: contains('volvo') },
          equipment('volvo'),
          customer('volvo'),
        ],
        inspectionStatus: { dueAt: { lt: before } },
      },
      sql: `${BASE} AND (${columnsSql} OR ${like('v."fleetNumber"')} OR ${equipmentSql} OR ${customerSql}) AND ${dueSql}`,
      values: ['org-1', true, ...words('volvo', 5), 'org-1', 'volvo', 'volvo', before],
    })
  })

  it('the sort and its direction filter nothing', () => {
    expect(both({ search: 'volvo', sortBy: 'services', sortOrder: 'asc' })).toEqual(
      both({ search: 'volvo' })
    )
  })
})
