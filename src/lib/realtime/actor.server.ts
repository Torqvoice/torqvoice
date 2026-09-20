import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ChangeAuthor } from './events'
import { shared } from './shared-state.server'

/**
 * Who is making the change, carried without being passed.
 *
 * A live update says "Christian changed this", and the write that caused it
 * is often five calls deep in a server action that never took a user as an
 * argument. Threading one through every function would be a refactor of the
 * whole codebase and would be forgotten in exactly the places that matter.
 *
 * `withAuth` and `withApiAuth` already know who is calling, so they run their
 * handler inside this store and anything underneath can ask. Node's async
 * context follows awaits, so a `publish` inside a transaction three calls down
 * still knows whose work it was.
 *
 * Nothing breaks without it: a background job or a script has no actor and
 * the change is attributed to the system, which is the honest answer.
 */

const SYSTEM: ChangeAuthor = { userId: null, name: null, source: 'system' }

/** One per process: the writer and the reader are rarely in the same bundle. */
const storage = shared('actor', () => new AsyncLocalStorage<ChangeAuthor>())

export function runAsActor<T>(actor: ChangeAuthor, run: () => T): T {
  return storage.run(actor, run)
}

export function currentActor(): ChangeAuthor {
  return storage.getStore() ?? SYSTEM
}
