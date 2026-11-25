/**
 * Keyset paging (lib/keyset.ts): walking a list batch by batch, each batch
 * asking for the rows after the last one shown, visits every row exactly
 * once and in the list's order, whatever the sort and however many rows
 * have no value in it.
 *
 * The where-objects the parts build are evaluated here against plain rows
 * the way Postgres would answer them, so the walk can be checked without a
 * database.
 */
import { describe, expect, it } from 'vitest'
import { type Cursor, keysetAfter, keysetColumn, keysetCursor, type KeysetPart } from '@/lib/keyset'

type Row = {
  id: string
  title: string
  techName: string | null
  promisedAt: Date | null
  total: number
  vehicle: { make: string; year: number; customer: { name: string } | null } | null
}

type Filter = Record<string, any>

function cmp(a: unknown, b: unknown) {
  const x = a instanceof Date ? a.getTime() : a
  const y = b instanceof Date ? b.getTime() : b
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

/** Whether `value` (a row, or a relation of one) passes `filter`. */
function matches(value: Filter | null, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === 'OR') return (condition as Filter[]).some((f) => matches(value, f))
    if (key === 'AND') return (condition as Filter[]).every((f) => matches(value, f))
    if (value == null) return false
    const field = value[key]
    if (condition === null) return field == null
    if (typeof condition === 'object' && !(condition instanceof Date)) {
      if ('is' in condition)
        return condition.is === null ? field == null : matches(field, condition.is)
      if ('isNot' in condition) return field != null
      if ('not' in condition) return field != null
      if ('equals' in condition) return field != null && cmp(field, condition.equals) === 0
      if ('gt' in condition) return field != null && cmp(field, condition.gt) > 0
      if ('lt' in condition) return field != null && cmp(field, condition.lt) < 0
      // A nested relation filter.
      return field != null && matches(field, condition)
    }
    return cmp(field, condition) === 0
  })
}

/** The rows in the order Postgres would return them for these parts. */
function sorted(rows: Row[], parts: KeysetPart[]) {
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const x = part.read(a)
      const y = part.read(b)
      if (x === null && y === null) continue
      if (x === null) return part.nulls === 'first' ? -1 : 1
      if (y === null) return part.nulls === 'first' ? 1 : -1
      const c = cmp(x, y)
      if (c !== 0) return part.dir === 'asc' ? c : -c
    }
    return a.id < b.id ? -1 : 1
  })
}

/** Walks the list in batches the way the infinite list does. */
function walk(rows: Row[], parts: KeysetPart[], size: number) {
  const order = sorted(rows, parts)
  const seen: string[] = []
  let cursor: Cursor | null = null
  for (let guard = 0; guard < 100; guard++) {
    const after = cursor ? keysetAfter(parts, cursor) : null
    const batch = order.filter((row) => !after || matches(row, after)).slice(0, size)
    if (batch.length === 0) break
    seen.push(...batch.map((row) => row.id))
    cursor = keysetCursor(parts, batch[batch.length - 1])
  }
  return { seen, expected: order.map((row) => row.id) }
}

const makes = ['Volvo', 'Audi', 'Volvo', 'Tesla']
const rows: Row[] = Array.from({ length: 37 }, (_, i) => ({
  id: `r${String(i).padStart(2, '0')}`,
  // Plenty of ties, so the id has to break them.
  title: ['Brakes', 'Service', 'Tyres'][i % 3],
  techName: i % 4 === 0 ? null : ['Ann', 'Bo', 'Cy'][i % 3],
  promisedAt: i % 5 === 0 ? null : new Date(Date.UTC(2026, 10, 1 + (i % 7), 9)),
  total: (i % 6) * 125.5,
  // Counter sales have no vehicle; some vehicles have no owner.
  vehicle:
    i % 6 === 0
      ? null
      : {
          make: makes[i % 4],
          year: 2010 + (i % 3),
          customer: i % 7 === 0 ? null : { name: ['Ola', 'Kari', 'Per'][i % 3] },
        },
}))

const sorts: [string, (dir: 'asc' | 'desc') => KeysetPart[]][] = [
  ['a plain column', (dir) => [keysetColumn(['title'], dir, 'string')]],
  ['a number', (dir) => [keysetColumn(['total'], dir, 'number')]],
  ['a nullable column', (dir) => [keysetColumn(['techName'], dir, 'string', { nullable: true })]],
  [
    'a date with empty ones last',
    (dir) => [keysetColumn(['promisedAt'], dir, 'date', { nullable: true, nulls: 'last' })],
  ],
  [
    'a date with empty ones first',
    (dir) => [keysetColumn(['promisedAt'], dir, 'date', { nullable: true, nulls: 'first' })],
  ],
  [
    'a relation that may be missing',
    (dir) => [
      keysetColumn(['vehicle', 'make'], dir, 'string'),
      keysetColumn(['vehicle', 'year'], dir, 'number'),
    ],
  ],
  [
    'a relation of a relation',
    (dir) => [keysetColumn(['vehicle', 'customer', 'name'], dir, 'string')],
  ],
]

describe('walking a list in batches', () => {
  for (const [name, parts] of sorts) {
    for (const dir of ['asc', 'desc'] as const) {
      it(`visits every row once, in order, sorted by ${name} ${dir}`, () => {
        for (const size of [1, 4, 10]) {
          const { seen, expected } = walk(rows, parts(dir), size)
          expect(seen).toEqual(expected)
        }
      })
    }
  }
})

describe('a cursor that does not fit the sort', () => {
  const parts = [keysetColumn(['title'], 'asc', 'string')]

  it('is refused rather than read some other way', () => {
    expect(() => keysetAfter(parts, { v: [], id: 'x' })).toThrow('Invalid cursor')
    expect(() => keysetAfter(parts, { v: [3], id: 'x' })).toThrow('Invalid cursor')
    expect(() => keysetAfter(parts, { v: [null], id: 'x' })).toThrow('Invalid cursor')
    expect(() =>
      keysetAfter([keysetColumn(['promisedAt'], 'asc', 'date')], { v: ['soon'], id: 'x' })
    ).toThrow('Invalid cursor')
  })
})

/**
 * A required relation (an inspection's vehicle and template) can never be
 * missing, and Prisma refuses `{ is: null }` on one. A sort through it must
 * not ask for that, and must still walk every row.
 */
describe('a relation every row has', () => {
  const withVehicle = rows.filter((row) => row.vehicle !== null)
  const parts = (dir: 'asc' | 'desc') => [
    keysetColumn(['vehicle', 'make'], dir, 'string', { required: true }),
    keysetColumn(['vehicle', 'year'], dir, 'number', { required: true }),
  ]

  for (const dir of ['asc', 'desc'] as const) {
    it(`never asks for a missing relation, sorted ${dir}`, () => {
      const cursor = keysetCursor(parts(dir), withVehicle[3])
      expect(JSON.stringify(keysetAfter(parts(dir), cursor))).not.toContain('"is":null')
    })

    it(`visits every row once, in order, sorted ${dir}`, () => {
      for (const size of [1, 4, 10]) {
        const { seen, expected } = walk(withVehicle, parts(dir), size)
        expect(seen).toEqual(expected)
      }
    })
  }

  it('refuses a cursor with no value there', () => {
    expect(() => keysetAfter(parts('asc'), { v: [null, 2010], id: 'x' })).toThrow('Invalid cursor')
  })
})
