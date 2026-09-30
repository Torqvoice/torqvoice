import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import { publishToBus } from './bus.server'
import { currentActor } from './actor.server'
import type { ChangeAuthor, RecordAction, RecordChange, RecordKind } from './events'
import { shared } from './shared-state.server'

/**
 * Saying that a record changed.
 *
 * One entry point, so there is one shape on the wire and one place to change
 * how announcing works. Callers almost never reach this directly: the Prisma
 * extension (prisma-realtime.server.ts) announces every write the app makes,
 * which is what stops a new feature from being quietly not live.
 *
 * Two properties worth knowing:
 *
 * - **Coalesced.** A save that writes a job, deletes its labour lines and
 *   writes them again is one change to the screen reading it, not four. The
 *   same record and action within a tick collapse, so a big save wakes each
 *   viewer once.
 * - **Never before the transaction commits.** A viewer answers an event by
 *   reading the record again, at once. Told while the transaction was still
 *   open, it read the row as it was before the save, showed that, and was
 *   never told again: the update looked lost. So a change made inside
 *   `db.$transaction` is held (`holdingChanges`, wired in lib/db.ts, so no
 *   writer has to remember) and sent when the transaction resolves. One that
 *   rolls back says nothing, because nothing happened.
 */

type Pending = Map<string, RecordChange>

/** Changes made inside one open transaction, waiting for it to commit. */
interface HeldChanges {
  held: Pending
  done: boolean
}

const transaction = shared('publish.transaction', () => new AsyncLocalStorage<HeldChanges>())

const keyOf = (change: RecordChange): string =>
  `${change.organizationId}:${change.kind}:${change.id ?? '*'}:${change.action}`

/**
 * Runs a transaction, and announces what it changed once it has committed.
 *
 * Node's async context follows the awaits inside the callback, so a write
 * five calls down is held without being passed anything. A transaction inside
 * another belongs to the outer one, which is the one that commits.
 */
export async function holdingChanges<T>(run: () => Promise<T>): Promise<T> {
  if (transaction.getStore()) return run()
  const scope: HeldChanges = { held: new Map(), done: false }
  try {
    const result = await transaction.run(scope, run)
    for (const change of scope.held.values()) enqueue(change)
    return result
  } finally {
    // A write still running after its transaction ended is announced at once
    // rather than dropped into a scope nobody will ever flush.
    scope.done = true
    scope.held.clear()
  }
}

const pending = shared<Pending>('publish.pending', () => new Map())
const flusher = shared('publish.flusher', () => ({
  timer: null as ReturnType<typeof setTimeout> | null,
}))

export interface PublishInput {
  kind: RecordKind
  /** Null when a bulk write touched several rows: only the workshop hears it. */
  id: string | null
  organizationId: string
  action?: RecordAction
  /** What part of the record changed, when the writer knows. */
  hint?: string
  /** Overrides the ambient actor; for a job acting on somebody's behalf. */
  by?: ChangeAuthor
}

export function publishRecordChange(input: PublishInput): void {
  if (!input.organizationId) return
  const change: RecordChange = {
    kind: input.kind,
    id: input.id,
    organizationId: input.organizationId,
    action: input.action ?? 'updated',
    by: input.by ?? currentActor(),
    at: Date.now(),
    hint: input.hint,
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[realtime] publish ${change.kind}:${change.id ?? '*'} ${change.action}` +
        `${change.hint ? ` (${change.hint})` : ''} by ${change.by.userId ?? 'system'}/${change.by.source}`
    )
  }
  const scope = transaction.getStore()
  if (scope && !scope.done) {
    scope.held.set(keyOf(change), change)
    return
  }
  enqueue(change)
}

function enqueue(change: RecordChange): void {
  pending.set(keyOf(change), change)
  if (flusher.timer) return
  flusher.timer = setTimeout(flush, 0)
  flusher.timer.unref?.()
}

function flush(): void {
  flusher.timer = null
  const changes = [...pending.values()]
  pending.clear()
  for (const change of changes) publishToBus({ t: 'record', change })
}

/** Sends whatever is waiting at once; for tests and for a clean shutdown. */
export function flushRecordChanges(): void {
  if (flusher.timer) clearTimeout(flusher.timer)
  flush()
}
