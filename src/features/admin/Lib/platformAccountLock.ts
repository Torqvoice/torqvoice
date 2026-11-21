import { db } from '@/lib/db'

/** One number for every platform account change, so they queue behind each other. */
const PLATFORM_ACCOUNT_LOCK = 4217001

/**
 * Runs one platform account change at a time, across every server.
 *
 * Each of these actions reads before it writes: is this the last admin, is
 * the account being deleted an admin. Two of them at once can each read a
 * state the other is about to change, and between them leave the platform
 * with no admin or delete one. A transaction-scoped advisory lock makes the
 * second wait for the first; it is released when the transaction ends,
 * however it ends.
 *
 * The caller passed the gate before waiting here, so the gate is asked again
 * once the lock is held: the change that was ahead in the queue may have
 * been the one that took this caller's rights away.
 *
 * `work` talks to the database on its own connections, as the deletion
 * helpers do. The transaction holds nothing but the lock.
 */
export async function withPlatformAccountLock<T>(
  actorId: string,
  work: () => Promise<T>,
  timeoutMs = 15_000
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLATFORM_ACCOUNT_LOCK}::bigint)`
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { isSuperAdmin: true },
      })
      if (!actor?.isSuperAdmin) throw new Error('Forbidden')
      return work()
    },
    { maxWait: 10_000, timeout: timeoutMs }
  )
}
