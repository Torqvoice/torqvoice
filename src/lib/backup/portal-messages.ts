/**
 * The portal chat through a restore. A message belongs to a customer and goes
 * with them when they are deleted, and a restore that carries customers
 * deletes and recreates them. So two things are decided here, apart from the
 * restore itself so they can be tested without a database.
 */

type Row = Record<string, unknown>

/**
 * A file with customers but without the chat (a customers-only export) would
 * take every conversation with it: the customers are replaced, the messages
 * cascade, and the file has none to put back. The restore then holds on to
 * the workshop's own messages and puts them back under the recreated
 * customers.
 */
export function keepsCurrentPortalMessages(data: {
  customers?: unknown
  portalMessages?: unknown
}): boolean {
  return data.customers !== undefined && data.portalMessages === undefined
}

/**
 * The rows that go back in: only those whose customer is in this workshop
 * after the restore, since a message without one has no thread to sit in.
 * The author is kept only when they are a member of this workshop; a user id
 * from another workshop on the same install would otherwise show that
 * person's name in the inbox and the portal as this workshop's staff.
 */
export function portalMessageRowsToRestore<T extends Row>(
  messages: readonly T[],
  customerIds: ReadonlySet<string>,
  memberIds: ReadonlySet<string>
): T[] {
  return messages
    .filter((m) => typeof m.customerId === 'string' && customerIds.has(m.customerId))
    .map((m) => ({
      ...m,
      authorUserId:
        typeof m.authorUserId === 'string' && memberIds.has(m.authorUserId) ? m.authorUserId : null,
    }))
}

/** The author ids a set of messages names, each once. */
export function portalMessageAuthorIds(messages: readonly Row[]): string[] {
  return [
    ...new Set(
      messages
        .map((m) => m.authorUserId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
}
