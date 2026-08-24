import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Short-lived public links for media we send over WhatsApp.
 *
 * Providers fetch the file themselves at send time, from their own servers,
 * with no session and no credentials of ours. Every upload in Torqvoice sits
 * behind `/api/protected/files`, so a photo of a worn brake disc would reach
 * Meta as a 401 and arrive at the customer as an empty message.
 *
 * A signed link solves that without making the uploads directory public: the
 * token names one file, expires within the hour, and proves nothing else.
 */

/** Long enough for a provider retry, short enough to be worthless if leaked. */
const DEFAULT_TTL_SECONDS = 60 * 60

function signingSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('No signing secret configured: set BETTER_AUTH_SECRET.')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url')
}

export interface WhatsappMediaClaim {
  /** The stored file URL, e.g. /api/protected/files/<org>/vehicles/<file>.jpg */
  fileUrl: string
  organizationId: string
}

/**
 * Mints a token for one file. The organization is part of the signature so a
 * token cannot be replayed against another workshop's storage.
 */
export function signWhatsappMediaToken(
  claim: WhatsappMediaClaim,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = Buffer.from(
    JSON.stringify({ u: claim.fileUrl, o: claim.organizationId, e: expiresAt })
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** Returns the claim when the token is intact and still valid, else null. */
export function verifyWhatsappMediaToken(token: string): WhatsappMediaClaim | null {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = sign(payload)

  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u?: string
      o?: string
      e?: number
    }
    if (!claim.u || !claim.o || !claim.e) return null
    if (claim.e * 1000 < Date.now()) return null
    return { fileUrl: claim.u, organizationId: claim.o }
  } catch {
    return null
  }
}
