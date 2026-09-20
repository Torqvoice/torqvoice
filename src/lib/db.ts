import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { realtimeExtension } from '@/lib/realtime/prisma-realtime.server'
import { holdingChanges } from '@/lib/realtime/publish.server'
import type { RecordKind } from '@/lib/realtime/events'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

/** The model each followed record lives in, for the workshop lookup below. */
const DELEGATE_OF: Record<RecordKind, string> = {
  serviceRecord: 'serviceRecord',
  inspection: 'inspection',
  quote: 'quote',
  vehicle: 'vehicle',
  customer: 'customer',
  inventoryPart: 'inventoryPart',
  tireSet: 'tireSet',
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  })
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  /**
   * Every write tells the screens that are watching it (lib/realtime). The
   * extension asks here for the workshop of a record a write did not name,
   * reading through the unextended client so the lookup cannot announce
   * anything of its own.
   */
  const extended = base.$extends(
    realtimeExtension({
      organizationOf: async (kind, id) => {
        const delegate = (base as unknown as Record<string, unknown>)[DELEGATE_OF[kind]] as
          | { findUnique(args: unknown): Promise<{ organizationId: string | null } | null> }
          | undefined
        if (!delegate) return null
        const row = await delegate.findUnique({
          where: { id },
          select: { organizationId: true },
        })
        return row?.organizationId ?? null
      },
    })
  )

  /**
   * A change made inside a transaction is announced when it commits, never
   * before: a screen told earlier re-reads the row as it was and shows that.
   * Only `$transaction` is wrapped, and its type is untouched, so every caller
   * stays as it is.
   */
  return new Proxy(extended, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property !== '$transaction' || typeof value !== 'function') return value
      return (...args: unknown[]) =>
        holdingChanges(() => Reflect.apply(value, target, args) as Promise<unknown>)
    },
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

/**
 * The client a `db.$transaction(...)` callback is handed.
 *
 * Prisma's own `Prisma.TransactionClient` describes the unextended client,
 * so a helper annotated with it no longer accepts what a transaction hands
 * over now that the client carries the realtime extension. Every helper that
 * takes a transaction takes this instead.
 */
export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

globalForPrisma.prisma = db
