import 'server-only'

import { db } from './db'
import { isReplyMailToken, newReplyMailToken } from './reply-mail'

/**
 * The workshop's reply token, minted on first use.
 *
 * Minting is an update of the null column only, so two sends racing for the
 * first token cannot each write their own: one wins, the other reads the
 * winner's. The token never changes afterwards, since a reply to an invoice
 * sent months ago still has to find the workshop.
 */
export async function ensureReplyMailToken(organizationId: string): Promise<string> {
  const current = await db.organization.findUnique({
    where: { id: organizationId },
    select: { replyMailToken: true },
  })
  if (!current) throw new Error('Organization not found')
  if (isReplyMailToken(current.replyMailToken)) return current.replyMailToken

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newReplyMailToken()
    const claimed = await db.organization.updateMany({
      where: { id: organizationId, replyMailToken: null },
      data: { replyMailToken: token },
    })
    if (claimed.count === 1) return token

    const again = await db.organization.findUnique({
      where: { id: organizationId },
      select: { replyMailToken: true },
    })
    if (isReplyMailToken(again?.replyMailToken)) return again.replyMailToken
  }
  throw new Error('Could not mint a reply token')
}

/** The workshop a reply token belongs to, or null for a token nobody holds. */
export async function organizationForReplyToken(token: string) {
  if (!isReplyMailToken(token)) return null
  return db.organization.findUnique({
    where: { replyMailToken: token },
    select: { id: true, name: true },
  })
}
