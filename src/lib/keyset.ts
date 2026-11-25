import { z } from 'zod'

/**
 * Keyset ("cursor") paging for the infinite lists.
 *
 * A list that loads more as it scrolls cannot use `skip`: a job added at the
 * top while somebody scrolls pushes every row down one, and the next batch
 * repeats the row the last one ended on; a job removed makes one vanish. A
 * keyset batch instead asks for the rows that sort after the last one shown,
 * by the values it was sorted on and its id, so what happens above it does
 * not matter.
 *
 * A list describes its sort as parts, in order: the column each sorts by, the
 * way round, where its empty values go, and how to read the value off a row.
 * The id is always the last part, ascending, so no two rows ever tie. From the
 * same parts come the `orderBy` and the `where` for the rows after a cursor,
 * so the two cannot disagree.
 */

export type KeyValue = string | number | null
type Direction = 'asc' | 'desc'
type Nulls = 'first' | 'last'
type Kind = 'string' | 'number' | 'date'
// Prisma's inputs are deeply generic per model; the parts build plain objects
// that the caller hands to the model's findMany.
type Where = Record<string, any>

/** Where in a list's batches to carry on from: the last row's sort values and id. */
export type Cursor = { v: KeyValue[]; id: string }

export const cursorSchema = z.object({
  v: z.array(z.union([z.string().max(500), z.number(), z.null()])).max(8),
  id: z.string().min(1).max(100),
})

export type KeysetPart = {
  dir: Direction
  /** Where rows without a value go. */
  nulls: Nulls
  kind: Kind
  /** Whether a row can have no value here at all. */
  canBeEmpty: boolean
  /** The value on a row, as it travels in a cursor. */
  read: (row: unknown) => KeyValue
  orderBy: () => Where
  compare: (op: 'gt' | 'lt' | 'equals', value: string | number | Date) => Where
  isNull: () => Where
  notNull: () => Where
}

/** Wraps `inner` in the relations named by `path`: ['vehicle'] → { vehicle: inner }. */
function nest(path: string[], inner: Where): Where {
  return path.reduceRight<Where>((acc, segment) => ({ [segment]: acc }), inner)
}

/**
 * One column to sort by. `path` is the relations to walk and then the column,
 * e.g. ['vehicle', 'customer', 'name']; each relation on the way is optional,
 * so a row without one counts as having no value.
 *
 * `nulls` is only given for a nullable column of the model itself, which is
 * where Prisma lets a list choose. Anything else gets the database's own
 * placement, empty values last ascending and first descending, which is what
 * Postgres does when nothing is said.
 */
export function keysetColumn(
  path: string[],
  dir: Direction,
  kind: Kind,
  options: { nullable?: boolean; nulls?: Nulls } = {}
): KeysetPart {
  const relations = path.slice(0, -1)
  const column = path[path.length - 1]
  const nullable = options.nullable ?? false
  const nulls: Nulls = options.nulls ?? (dir === 'asc' ? 'last' : 'first')
  const canBeEmpty = nullable || relations.length > 0

  return {
    dir,
    nulls,
    kind,
    canBeEmpty,
    read: (row) => {
      let value: unknown = row
      for (const segment of path) {
        value = value == null ? null : (value as Record<string, unknown>)[segment]
      }
      if (value == null) return null
      if (value instanceof Date) return value.toISOString()
      return value as string | number
    },
    orderBy: () =>
      nest(relations, {
        [column]: options.nulls && nullable ? { sort: dir, nulls: options.nulls } : dir,
      }),
    compare: (op, value) =>
      nest(relations, { [column]: op === 'equals' ? { equals: value } : { [op]: value } }),
    isNull: () => {
      const either: Where[] = relations.map((segment, i) =>
        nest(relations.slice(0, i), { [segment]: { is: null } })
      )
      if (nullable) either.push(nest(relations, { [column]: null }))
      return either.length === 1 ? either[0] : { OR: either }
    },
    notNull: () => {
      if (nullable) return nest(relations, { [column]: { not: null } })
      if (!canBeEmpty) return {}
      const last = relations[relations.length - 1]
      return nest(relations.slice(0, -1), { [last]: { isNot: null } })
    },
  }
}

/** The `orderBy` for a sort, with the id as the final tie-breaker. */
export function keysetOrderBy(parts: KeysetPart[]): Where[] {
  return [...parts.map((part) => part.orderBy()), { id: 'asc' }]
}

/** The cursor that carries on after `row`. */
export function keysetCursor(parts: KeysetPart[], row: { id: string }): Cursor {
  return { v: parts.map((part) => part.read(row)), id: row.id }
}

function parseValue(kind: Kind, value: string | number): string | number | Date {
  if (kind === 'date') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('Invalid cursor')
    return date
  }
  if (kind === 'number' && typeof value !== 'number') throw new Error('Invalid cursor')
  if (kind === 'string' && typeof value !== 'string') throw new Error('Invalid cursor')
  return value
}

/**
 * The rows that sort strictly after `cursor`: for each part in turn, every
 * earlier part equal and this one further along, and finally the same values
 * with a later id.
 *
 * A cursor that does not fit the sort (a tab from before the sort changed) is
 * refused rather than read some other way round.
 */
export function keysetAfter(parts: KeysetPart[], cursor: Cursor): Where {
  if (cursor.v.length !== parts.length) throw new Error('Invalid cursor')
  const values = parts.map((part, i) => {
    const value = cursor.v[i]
    if (value === null && !part.canBeEmpty) throw new Error('Invalid cursor')
    return value === null ? null : parseValue(part.kind, value)
  })
  const equal = (i: number) => {
    const value = values[i]
    return value === null ? parts[i].isNull() : parts[i].compare('equals', value)
  }
  const after = (i: number): Where | null => {
    const part = parts[i]
    const value = values[i]
    if (value === null) return part.nulls === 'first' ? part.notNull() : null
    const further = part.compare(part.dir === 'asc' ? 'gt' : 'lt', value)
    return part.nulls === 'last' && part.canBeEmpty ? { OR: [further, part.isNull()] } : further
  }

  const branches: Where[] = []
  for (let i = 0; i <= parts.length; i++) {
    const tail = i === parts.length ? { id: { gt: cursor.id } } : after(i)
    if (!tail) continue
    const head = Array.from({ length: i }, (_, j) => equal(j))
    branches.push(head.length ? { AND: [...head, tail] } : tail)
  }
  return { OR: branches }
}
