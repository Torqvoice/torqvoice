import 'server-only'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

export type SharedDocumentKind = 'quote' | 'invoice' | 'inspection'

/**
 * The document's share link token, minting one for a document that was never
 * shared.
 *
 * The write only lands while the token is still empty, and the token is read
 * back afterwards. Two sends racing for a document's first link would
 * otherwise each write their own, and the one that lost would have delivered
 * a link the other had just replaced. An existing token is never touched: the
 * customer may already hold it.
 *
 * Getting the token does not renew the link: a send that is then refused
 * must not reopen a link that had closed. `renewShareLink` does that, once
 * the message is on its way.
 */
export async function ensureShareToken(
  kind: SharedDocumentKind,
  id: string,
  organizationId: string
): Promise<string | null> {
  const unshared = { id, organizationId, publicToken: null }
  const mint = { publicToken: randomUUID(), sharedAt: new Date() }
  const mine = { where: { id, organizationId }, select: { publicToken: true } } as const

  if (kind === 'quote') {
    await db.quote.updateMany({ where: unshared, data: mint })
    return (await db.quote.findFirst(mine))?.publicToken ?? null
  }
  if (kind === 'invoice') {
    await db.serviceRecord.updateMany({ where: unshared, data: mint })
    return (await db.serviceRecord.findFirst(mine))?.publicToken ?? null
  }
  await db.inspection.updateMany({ where: unshared, data: mint })
  return (await db.inspection.findFirst(mine))?.publicToken ?? null
}

/**
 * Renews a link that has just been handed to a customer: the workshop's
 * expiry rule counts from now, and a date on this document that has already
 * passed is dropped. A customer who is sent a link must be able to open it.
 * A date still ahead is the workshop's own answer and stays.
 *
 * Called only after the email or message was accepted for delivery.
 */
export async function renewShareLink(
  kind: SharedDocumentKind,
  id: string,
  organizationId: string
): Promise<void> {
  const now = new Date()
  const shared = { id, organizationId, publicToken: { not: null } }
  const lapsed = { ...shared, shareExpiresAt: { lt: now } }
  const renew = { shareRenewedAt: now }
  const drop = { shareExpiresAt: null }

  if (kind === 'quote') {
    await db.quote.updateMany({ where: shared, data: renew })
    await db.quote.updateMany({ where: lapsed, data: drop })
    return
  }
  if (kind === 'invoice') {
    await db.serviceRecord.updateMany({ where: shared, data: renew })
    await db.serviceRecord.updateMany({ where: lapsed, data: drop })
    return
  }
  await db.inspection.updateMany({ where: shared, data: renew })
  await db.inspection.updateMany({ where: lapsed, data: drop })
}
