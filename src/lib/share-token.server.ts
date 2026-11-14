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
 */
export async function ensureShareToken(
  kind: SharedDocumentKind,
  id: string,
  organizationId: string
): Promise<string | null> {
  const where = { id, organizationId, publicToken: null }
  const token = randomUUID()
  if (kind === 'quote') {
    await db.quote.updateMany({ where, data: { publicToken: token, sharedAt: new Date() } })
    const row = await db.quote.findFirst({
      where: { id, organizationId },
      select: { publicToken: true },
    })
    return row?.publicToken ?? null
  }
  if (kind === 'invoice') {
    await db.serviceRecord.updateMany({
      where,
      data: { publicToken: token, sharedAt: new Date() },
    })
    const row = await db.serviceRecord.findFirst({
      where: { id, organizationId },
      select: { publicToken: true },
    })
    return row?.publicToken ?? null
  }
  await db.inspection.updateMany({ where, data: { publicToken: token } })
  const row = await db.inspection.findFirst({
    where: { id, organizationId },
    select: { publicToken: true },
  })
  return row?.publicToken ?? null
}
