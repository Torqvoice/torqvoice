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
 * Every caller is about to hand the link to a customer, so the link is also
 * renewed: the workshop's expiry rule counts from now, and a date on this
 * document that has already passed is dropped. A customer who is sent a link
 * must be able to open it. A date still ahead is the workshop's own answer
 * and stays.
 */
export async function ensureShareToken(
  kind: SharedDocumentKind,
  id: string,
  organizationId: string
): Promise<string | null> {
  const now = new Date()
  const unshared = { id, organizationId, publicToken: null }
  const shared = { id, organizationId, publicToken: { not: null } }
  const lapsed = { ...shared, shareExpiresAt: { lt: now } }
  const mint = { publicToken: randomUUID(), sharedAt: now }
  const renew = { shareRenewedAt: now }
  const drop = { shareExpiresAt: null }

  if (kind === 'quote') {
    await db.quote.updateMany({ where: unshared, data: mint })
    await db.quote.updateMany({ where: shared, data: renew })
    await db.quote.updateMany({ where: lapsed, data: drop })
    const row = await db.quote.findFirst({
      where: { id, organizationId },
      select: { publicToken: true },
    })
    return row?.publicToken ?? null
  }
  if (kind === 'invoice') {
    await db.serviceRecord.updateMany({ where: unshared, data: mint })
    await db.serviceRecord.updateMany({ where: shared, data: renew })
    await db.serviceRecord.updateMany({ where: lapsed, data: drop })
    const row = await db.serviceRecord.findFirst({
      where: { id, organizationId },
      select: { publicToken: true },
    })
    return row?.publicToken ?? null
  }
  await db.inspection.updateMany({ where: unshared, data: mint })
  await db.inspection.updateMany({ where: shared, data: renew })
  await db.inspection.updateMany({ where: lapsed, data: drop })
  const row = await db.inspection.findFirst({
    where: { id, organizationId },
    select: { publicToken: true },
  })
  return row?.publicToken ?? null
}
