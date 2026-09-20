import 'server-only'

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { PresenceUser, RecordChange } from './events'
import { shared } from './shared-state.server'

/**
 * One workshop's live events, across however many app instances are running.
 *
 * Inside a process this is an EventEmitter. Between processes it is Postgres,
 * which the app already runs: `pg_notify` on one instance, `LISTEN` on the
 * others. No Redis to operate, and the properties fit what is being sent:
 *
 * - **Tiny payloads.** Postgres refuses a notification over 8000 bytes, and
 *   an event here is ids and a name. Presence snapshots are capped for the
 *   same reason (see `publishPresence`).
 * - **At most once.** A notification is not stored and not acknowledged; a
 *   listener that is down misses it. That is survivable because no screen
 *   holds state from the socket alone: every one of them re-reads what it has
 *   open when the connection comes back, so a lost frame costs a refresh, not
 *   correctness.
 * - **After commit.** `pg_notify` from inside a transaction fires when the
 *   transaction commits, which is exactly when the change is real.
 *
 * Every instance stamps its own id on what it sends and drops what comes back
 * with that id, because it has already delivered it locally.
 */

const CHANNEL = 'torqvoice_realtime'
/** Postgres refuses more than 8000 bytes; stay well under it. */
const MAX_PAYLOAD_BYTES = 7000

/**
 * One per process, not one per copy of this module: a second copy with its own
 * id would take this process's frames for another instance's, deliver them
 * twice, and count everybody in a room as being there on two devices.
 */
export const INSTANCE_ID = shared('bus.instanceId', () => randomUUID())

/** What travels between instances. Local delivery uses the same shapes. */
export type BusMessage =
  | { t: 'record'; change: RecordChange }
  | {
      t: 'presence'
      room: string
      /** Which instance is speaking, so each one keeps its own slot. */
      instanceId: string
      /** The sending instance's own occupants of that room. */
      users: PresenceUser[]
      /** Millis after which this instance's list is stale and dropped. */
      ttlMs: number
    }
  | { t: 'legacy'; channel: 'notification' | 'workboard' | 'broadcast'; data: unknown }

type Envelope = BusMessage & { from: string }

const globalForBus = globalThis as unknown as {
  torqvoiceRealtimeBus?: EventEmitter
  torqvoiceRealtimeBridge?: Bridge
}

/** Survives hot reload in development, like the Prisma client does. */
const emitter = (globalForBus.torqvoiceRealtimeBus ??= new EventEmitter().setMaxListeners(0))

/** Runs `handler` for every message, this instance's own included. */
export function onBusMessage(handler: (message: BusMessage) => void): () => void {
  emitter.on('message', handler)
  return () => {
    emitter.off('message', handler)
  }
}

/**
 * Sends a message to every instance, including this one.
 *
 * Delivered locally first and without waiting: a screen in this process must
 * not wait on a database round trip to see a change made in this process.
 */
export function publishToBus(message: BusMessage): void {
  emitter.emit('message', message)
  void relay(message)
}

async function relay(message: BusMessage): Promise<void> {
  const bridge = ensureBridge()
  if (!bridge) return
  const payload = JSON.stringify({ ...message, from: INSTANCE_ID } satisfies Envelope)
  if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
    // Nothing sent here is anywhere near the limit, so this is a bug rather
    // than a case to handle: say so, and let the other instances miss it
    // instead of failing the write that caused it.
    console.error(`[realtime] refusing to relay ${payload.length} bytes on ${CHANNEL}`)
    return
  }
  await bridge.notify(payload)
}

/* ------------------------------------------------------------- bridge --- */

interface Bridge {
  notify(payload: string): Promise<void>
}

/**
 * The Postgres side, started the first time something is published and kept
 * for the life of the process.
 *
 * Its own connection, not one of Prisma's: `LISTEN` belongs to a session, and
 * a pooled connection handed back after the query would stop listening. The
 * same connection sends, so one socket per instance carries both directions.
 */
function ensureBridge(): Bridge | null {
  if (globalForBus.torqvoiceRealtimeBridge) return globalForBus.torqvoiceRealtimeBridge
  const url = process.env.DATABASE_URL
  if (!url) return null
  if (process.env.REALTIME_BRIDGE === 'off') return null

  const bridge = createBridge(url)
  globalForBus.torqvoiceRealtimeBridge = bridge
  return bridge
}

/** Reconnect delays: quick at first, then patient, like the browser's. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

function createBridge(connectionString: string): Bridge {
  // Imported lazily so nothing in the browser bundle or in a unit test pulls
  // a database driver in on module load.
  type PgClient = {
    connect(): Promise<void>
    query(text: string, values?: unknown[]): Promise<unknown>
    on(event: string, handler: (arg: unknown) => void): void
    end(): Promise<void>
  }

  let client: PgClient | null = null
  let connecting: Promise<PgClient | null> | null = null
  let attempt = 0

  const connect = async (): Promise<PgClient | null> => {
    const { Client } = (await import('pg')) as unknown as {
      Client: new (config: { connectionString: string }) => PgClient
    }
    const next = new Client({ connectionString })
    next.on('notification', (raw) => {
      const message = (raw ?? {}) as { channel?: string; payload?: string }
      if (message.channel !== CHANNEL || !message.payload) return
      try {
        const envelope = JSON.parse(message.payload) as Envelope
        // Already delivered locally when this instance published it.
        if (envelope.from === INSTANCE_ID) return
        const { from: _from, ...rest } = envelope
        emitter.emit('message', rest as BusMessage)
      } catch {
        /* a frame we cannot read is not worth a crashed listener */
      }
    })
    next.on('error', (error) => {
      console.error('[realtime] bridge connection lost:', error)
      client = null
      connecting = null
      schedule()
    })
    await next.connect()
    await next.query(`LISTEN ${CHANNEL}`)
    attempt = 0
    client = next
    return next
  }

  const schedule = () => {
    const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
    attempt++
    setTimeout(() => {
      void ensure().catch(() => undefined)
    }, delay).unref?.()
  }

  const ensure = async (): Promise<PgClient | null> => {
    if (client) return client
    if (!connecting) {
      connecting = connect().catch((error) => {
        console.error('[realtime] bridge could not connect:', error)
        connecting = null
        schedule()
        return null
      })
    }
    return connecting
  }

  // Start listening at once: an instance that only ever receives, because
  // nobody on it writes anything, still has to hear the others.
  void ensure().catch(() => undefined)

  return {
    async notify(payload: string) {
      const connection = await ensure()
      if (!connection) return
      try {
        await connection.query('SELECT pg_notify($1, $2)', [CHANNEL, payload])
      } catch (error) {
        // The write that caused this has already happened and must not fail
        // because the other instances could not be told.
        console.error('[realtime] could not relay an event:', error)
      }
    },
  }
}
