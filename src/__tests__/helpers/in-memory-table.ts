/**
 * A Prisma model's `findMany` and `count` over plain rows, for testing the
 * infinite lists' actions without a database: it answers the where, orderBy,
 * skip, take and distinct an action builds the way Postgres would, so a test
 * can walk a list batch by batch through the real action (`walkBatches`) and
 * see exactly which rows come back.
 *
 * It understands what the list builders and lib/keyset.ts write: AND / OR /
 * NOT, equality, null, `in`, `notIn`, `not`, `contains` (with or without
 * `mode: 'insensitive'`), `gt` / `gte` / `lt` / `lte` / `equals`, to-one
 * relations (nested, `is`, `isNot`), to-many `some`, and ordering by columns,
 * relations and a relation's `_count`, with `nulls` placed as Postgres does.
 */

// Prisma's where and orderBy are plain nested objects of any shape.
type Row = Record<string, any>
type Filter = Record<string, any>

function comparable(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'boolean') return Number(value)
  return value
}

function cmp(a: unknown, b: unknown): number {
  const x = comparable(a)
  const y = comparable(b)
  if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

function isPlainObject(value: unknown): value is Filter {
  return (
    typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value)
  )
}

const OPERATORS = ['equals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'not', 'contains', 'mode']

/** Whether a scalar passes a condition such as `{ gt: 3 }` or `'draft'`. */
function scalarMatches(field: unknown, condition: unknown): boolean {
  if (condition === null) return field == null
  if (!isPlainObject(condition)) return field != null && cmp(field, condition) === 0
  return Object.entries(condition).every(([op, value]) => {
    switch (op) {
      case 'equals':
        return value === null ? field == null : field != null && cmp(field, value) === 0
      case 'gt':
        return field != null && cmp(field, value) > 0
      case 'gte':
        return field != null && cmp(field, value) >= 0
      case 'lt':
        return field != null && cmp(field, value) < 0
      case 'lte':
        return field != null && cmp(field, value) <= 0
      case 'in':
        return (value as unknown[]).some((v) => field != null && cmp(field, v) === 0)
      // SQL: NULL NOT IN (...) and NULL <> x are not true, so an empty value fails.
      case 'notIn':
        return field != null && !(value as unknown[]).some((v) => cmp(field, v) === 0)
      case 'not':
        return value === null ? field != null : field != null && !scalarMatches(field, value)
      case 'contains': {
        if (typeof field !== 'string') return false
        return condition.mode === 'insensitive'
          ? field.toLowerCase().includes(String(value).toLowerCase())
          : field.includes(String(value))
      }
      case 'mode':
        return true
      default:
        throw new Error(`in-memory table: unknown operator ${op}`)
    }
  })
}

/** Whether `row` (a row, or a relation of one) passes `filter`. */
export function matches(row: Row | null | undefined, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === 'AND') return (condition as Filter[]).every((f) => matches(row, f))
    if (key === 'OR') return (condition as Filter[]).some((f) => matches(row, f))
    if (key === 'NOT') return !matches(row, condition as Filter)
    if (row == null) return false
    const field = row[key]
    if (isPlainObject(condition)) {
      if ('is' in condition)
        return condition.is === null ? field == null : matches(field, condition.is)
      if ('isNot' in condition)
        return condition.isNot === null ? field != null : !matches(field, condition.isNot)
      if ('some' in condition)
        return Array.isArray(field) && field.some((item) => matches(item, condition.some))
      if (Object.keys(condition).every((k) => OPERATORS.includes(k)))
        return scalarMatches(field, condition)
      // A filter on a to-one relation.
      return field != null && matches(field, condition)
    }
    return scalarMatches(field, condition)
  })
}

type Sort = { dir: 'asc' | 'desc'; nulls: 'first' | 'last'; read: (row: Row) => unknown }

/** One entry of an orderBy, flattened to the value it sorts by. */
function sortOf(entry: Filter): Sort {
  const path: string[] = []
  let node: unknown = entry
  while (isPlainObject(node)) {
    const [key, value] = Object.entries(node)[0]
    if (key === 'sort') {
      const { sort, nulls } = node as { sort: 'asc' | 'desc'; nulls?: 'first' | 'last' }
      return make(path, sort, nulls)
    }
    path.push(key)
    node = value
  }
  return make(path, node as 'asc' | 'desc')

  function make(p: string[], dir: 'asc' | 'desc', nulls?: 'first' | 'last'): Sort {
    // Postgres: empty values last ascending, first descending, unless told.
    const placed = nulls ?? (dir === 'asc' ? 'last' : 'first')
    const read = (row: Row) => {
      let value: unknown = row
      for (const [i, segment] of p.entries()) {
        if (value == null) return null
        // `{ serviceRecords: { _count: 'desc' } }` counts the relation.
        if (segment === '_count' && i === p.length - 1) return (value as unknown[]).length
        value = (value as Row)[segment]
      }
      return value ?? null
    }
    return { dir, nulls: placed, read }
  }
}

/** The rows in the order Postgres would return them for this orderBy. */
export function ordered<T extends Row>(rows: T[], orderBy: Filter | Filter[] | undefined): T[] {
  const sorts = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map(sortOf)
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const x = sort.read(a)
      const y = sort.read(b)
      if (x == null && y == null) continue
      if (x == null) return sort.nulls === 'first' ? -1 : 1
      if (y == null) return sort.nulls === 'first' ? 1 : -1
      const c = cmp(x, y)
      if (c !== 0) return sort.dir === 'asc' ? c : -c
    }
    return 0
  })
}

type FindManyArgs = {
  where?: Filter
  orderBy?: Filter | Filter[]
  skip?: number
  take?: number
  distinct?: string[]
}

/** `findMany` and `count` that answer from `rows`, for a mocked `db.<model>`. */
export function inMemoryTable<T extends Row>(rows: () => T[]) {
  const filtered = (where: Filter | undefined) =>
    rows().filter((row) => !where || matches(row, where))
  return {
    findMany: async (args: FindManyArgs = {}): Promise<T[]> => {
      let found = ordered(filtered(args.where), args.orderBy)
      if (args.distinct) {
        const columns = args.distinct
        const seen = new Set<string>()
        found = found.filter((row) => {
          const key = JSON.stringify(columns.map((column) => row[column]))
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }
      const start = args.skip ?? 0
      return found.slice(start, args.take === undefined ? undefined : start + args.take)
    },
    count: async (args: { where?: Filter } = {}) => filtered(args.where).length,
  }
}

/** What a list action hands back for one batch. */
type BatchResult<R, C> = {
  success: boolean
  data?: { rows: R[]; nextCursor: C | null; total?: number }
  error?: string
}

/** The cursor travels to the browser and back as JSON between batches. */
function overTheWire<C>(cursor: C): C {
  return JSON.parse(JSON.stringify(cursor))
}

/**
 * Every row of a list, read batch by batch through its action the way the
 * infinite list does: each batch asks for the rows after the last one's
 * cursor, until a batch says there are no more. The action's own input,
 * cursor and row types flow through:
 *
 *   walkBatches(getQuoteRows, (cursor) => ({ status: 'draft', cursor }))
 *
 * `const I` keeps a literal such as `sortOrder: 'asc'` from widening to string
 * before it is checked against the action's input.
 */
export async function walkBatches<const I, R extends { id: string }, C>(
  action: (input: I) => Promise<BatchResult<R, C>>,
  inputFor: (cursor: C | null) => I
): Promise<{ ids: string[]; rows: R[]; batches: number; total: number | undefined }> {
  const rows: R[] = []
  let cursor: C | null = null
  let batches = 0
  let total: number | undefined
  for (let guard = 0; guard < 1000; guard++) {
    const result = await action(inputFor(cursor))
    if (!result.success || !result.data) throw new Error(result.error || 'batch failed')
    if (batches === 0) total = result.data.total
    batches++
    rows.push(...result.data.rows)
    if (result.data.nextCursor === null)
      return { ids: rows.map((row) => row.id), rows, batches, total }
    cursor = overTheWire(result.data.nextCursor)
  }
  throw new Error('the list never ended')
}

/**
 * What the count sorts' SQL answers (`customerIdsByVehicleCount`,
 * `vehicleIdsByServiceCount`), over plain rows: the workshop's rows among
 * `ids`, after the cursor's count and id, by count in `dir` and then by id,
 * each with its count. The real query is checked against Postgres; this lets
 * a test walk the action around it.
 */
export function countKeysetIds<T extends Row & { id: string; organizationId: string }>(
  rows: T[],
  countOf: (row: T) => number,
  args: {
    organizationId: string
    ids: string[]
    dir: 'asc' | 'desc'
    cursor: { v: unknown[]; id: string } | null | undefined
    take: number
  }
): { id: string; count: number }[] {
  const wanted = new Set(args.ids)
  const after = (count: number, id: string) => {
    if (!args.cursor) return true
    const value = args.cursor.v[0] as number
    if (count === value) return id > args.cursor.id
    return args.dir === 'asc' ? count > value : count < value
  }
  return rows
    .filter((row) => row.organizationId === args.organizationId && wanted.has(row.id))
    .map((row) => ({ id: row.id, count: countOf(row) }))
    .filter((entry) => after(entry.count, entry.id))
    .sort((a, b) =>
      a.count !== b.count
        ? args.dir === 'asc'
          ? a.count - b.count
          : b.count - a.count
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
    )
    .slice(0, args.take)
}
