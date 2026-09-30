import 'server-only'

/**
 * State that has to be one thing per process, however many times its module
 * is loaded.
 *
 * A module's top-level `const` is not that. Next builds server actions, pages
 * and route handlers as separate bundles, each with its own copy of a module,
 * and development re-evaluates a module every time it is edited. The Prisma
 * client and the event bus were already kept on `globalThis` for this reason,
 * and the rest was not, which broke the layer in two quiet ways:
 *
 * - `withAuth` recorded who was writing in one copy of the actor store while
 *   the Prisma hook, created once and kept for the life of the process, read
 *   another. Every save came out as the system's, so no page could recognise
 *   its own change.
 * - The socket route put a browser into one copy of the room map while
 *   changes were sent to the people in another: subscribed, and told nothing.
 *
 * Everything the live layer shares across requests is created through here.
 */
export function shared<T>(key: string, create: () => T): T {
  const store = globalThis as unknown as Record<string, unknown>
  const name = `torqvoice.realtime.${key}`
  if (!(name in store)) store[name] = create()
  return store[name] as T
}
