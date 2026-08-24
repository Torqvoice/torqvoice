import type { InboxThread } from '../Actions/inboxActions'

/**
 * Interleaves the per-channel pages into one, newest first.
 *
 * Lives outside the server action because every export of a 'use server'
 * module has to be an async function, and this one is neither async nor
 * something a client should be able to call.
 */
export function mergeChannelPages(
  pages: InboxThread[][],
  limit: number
): { threads: InboxThread[]; nextCursor: string | null } {
  const merged = pages.flat().sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  const threads = merged.slice(0, limit)

  // A channel that filled its page may be holding more behind it. If every
  // channel came back short, this is the end of the list whatever the total.
  const anyChannelFull = pages.some((page) => page.length >= limit)
  const nextCursor =
    anyChannelFull && threads.length > 0 ? threads[threads.length - 1].lastAt : null

  return { threads, nextCursor }
}
