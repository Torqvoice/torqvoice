import { TENANCY_SCHEMA } from './tenancy-schema'

/**
 * The transaction client a restore writes through, wrapped so that no call
 * can reach another workshop's rows. Every delete, update and upsert must
 * name the restoring organisation in its where, and every create for a model
 * with an organisation column must stamp that organisation on each row.
 * Anything else throws, which rolls the whole restore back. The checks are
 * on the call as written, not on what the database holds, so a wrong call
 * fails in a unit test long before it has a database to reach.
 */

export class TenantGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantGuardError'
  }
}

const WRITES_BY_WHERE = new Set(['delete', 'deleteMany', 'update', 'updateMany', 'upsert'])
const CREATES = new Set(['create', 'createMany', 'createManyAndReturn'])
const READS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
])

function modelName(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1)
}

/**
 * The operators that can widen a where beyond the rows an organisation id
 * constrains: `{ OR: [{ organizationId }, { id }] }` matches the other row
 * too. `AND` cannot, so it stays allowed.
 */
const WIDENING_OPERATORS = new Set(['OR', 'NOT', 'XOR'])

/**
 * Every value under an `organizationId` key anywhere inside a where, however
 * nested. Returns null when the where uses OR, NOT or XOR at any depth, where
 * an organisation id no longer limits what matches.
 */
function organizationIdsIn(where: unknown, out: unknown[] = []): unknown[] | null {
  if (Array.isArray(where)) {
    for (const item of where) if (organizationIdsIn(item, out) === null) return null
  } else if (where && typeof where === 'object') {
    for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
      if (WIDENING_OPERATORS.has(key)) return null
      if (key === 'organizationId') out.push(value)
      else if (organizationIdsIn(value, out) === null) return null
    }
  }
  return out
}

function describe(model: string, operation: string): string {
  return `${model}.${operation}`
}

/**
 * Refuses a call the restore may not make. `delegate` is the client property
 * (`serviceRecord`), `operation` the method (`createMany`).
 */
export function assertTenantScopedCall(
  delegate: string,
  operation: string,
  args: unknown,
  organizationId: string
): void {
  const model = modelName(delegate)
  const known = TENANCY_SCHEMA[model]
  const a = (args ?? {}) as Record<string, unknown>
  if (WRITES_BY_WHERE.has(operation)) {
    const ids = organizationIdsIn(a.where)
    if (ids === null) {
      throw new TenantGuardError(
        `${describe(model, operation)} may not use OR, NOT or XOR in its where during a restore`
      )
    }
    if (ids.length === 0) {
      throw new TenantGuardError(
        `${describe(model, operation)} must name the organisation in its where`
      )
    }
    if (ids.some((id) => id !== organizationId)) {
      throw new TenantGuardError(`${describe(model, operation)} names another organisation`)
    }
    if (operation === 'upsert') assertCreateData(model, operation, a.create, organizationId)
    return
  }
  if (CREATES.has(operation)) {
    if (!known?.organizationId) return
    assertCreateData(model, operation, a.data, organizationId)
    return
  }
  if (READS.has(operation)) return
  throw new TenantGuardError(`${describe(model, operation)} is not allowed in a restore`)
}

function assertCreateData(model: string, operation: string, data: unknown, organizationId: string) {
  const known = TENANCY_SCHEMA[model]
  if (!known?.organizationId) return
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return
  for (const row of rows) {
    const stamped = (row as Record<string, unknown> | null)?.organizationId
    if (stamped === undefined) {
      throw new TenantGuardError(`${describe(model, operation)} does not stamp the organisation`)
    }
    if (stamped !== organizationId) {
      throw new TenantGuardError(`${describe(model, operation)} stamps another organisation`)
    }
  }
}

/**
 * Wraps a transaction client. Model delegates come back wrapped; `$`-prefixed
 * members and anything that is not a function pass through untouched.
 */
export function tenantScoped<T extends object>(tx: T, organizationId: string): T {
  const delegates = new Map<string, object>()
  return new Proxy(tx, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || property.startsWith('$') || !value) return value
      if (typeof value !== 'object') return value
      let wrapped = delegates.get(property)
      if (!wrapped) {
        wrapped = new Proxy(value as object, {
          get(delegate, method, delegateReceiver) {
            const fn = Reflect.get(delegate, method, delegateReceiver)
            if (typeof method !== 'string' || typeof fn !== 'function') return fn
            return (args: unknown) => {
              // A refusal comes back the way a failed query would, as a rejection.
              try {
                assertTenantScopedCall(property, method, args, organizationId)
              } catch (err) {
                return Promise.reject(err)
              }
              return Reflect.apply(fn, delegate, [args])
            }
          },
        })
        delegates.set(property, wrapped)
      }
      return wrapped
    },
  })
}
