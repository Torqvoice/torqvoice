import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The link behind the "Add photos from phone" QR code on a work order.
 *
 * The desk shows a code, somebody walks out to the car with their phone,
 * scans it, and the photos they take land on that work order. The phone is
 * not signed in, so the link itself is the permission, and it is kept as
 * narrow as a permission can be:
 * - it names one work order in one workshop (and optionally one concern);
 * - it can only add photos; nothing is read through it beyond the job's
 *   number, its plate and the one concern the photos go under, so the person
 *   holding the phone knows they are on the right car and the right problem;
 * - it stops working after `PHOTO_HANDOFF_TTL_SECONDS`.
 *
 * Signed, not stored: an HMAC over the payload with the app's secret, the way
 * the WhatsApp media links are. So nothing needs a migration or a cleanup
 * job, and the price is that a code cannot be withdrawn early; it lapses.
 */

/** Long enough to walk out, shoot a car and come back; short enough to be worthless if a screenshot leaks. */
export const PHOTO_HANDOFF_TTL_SECONDS = 30 * 60

const PREFIX = 'ph1'

/**
 * What the phone is being asked for. 'photos' is the ordinary code: any photo
 * or PDF, filed with the job's files. 'dropoff' is the walk round the car as
 * it arrives: photos only, a fixed list of shots, kept in a place of their own
 * and off the invoice. It is part of the signed payload, so a phone cannot
 * turn one kind of code into the other.
 */
export type PhotoHandoffPurpose = 'photos' | 'dropoff'

export interface PhotoHandoff {
  organizationId: string
  serviceRecordId: string
  /** File the photos under this concern. */
  concernId: string | null
  purpose: PhotoHandoffPurpose
  /** Who showed the code, for the record of who added the photos. */
  userId: string
  /** Unix seconds. */
  expiresAt: number
}

function signingSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('No signing secret configured: set BETTER_AUTH_SECRET.')
  return secret
}

function sign(body: string): string {
  // The prefix is part of what is signed, so a token of another kind signed
  // with the same secret can never be passed off as one of these.
  return createHmac('sha256', signingSecret()).update(`${PREFIX}.${body}`).digest('base64url')
}

export function createPhotoHandoffToken(
  handoff: Omit<PhotoHandoff, 'expiresAt'>,
  now = Date.now()
): { token: string; expiresAt: Date } {
  const expiresAt = Math.floor(now / 1000) + PHOTO_HANDOFF_TTL_SECONDS
  const body = Buffer.from(
    JSON.stringify({
      o: handoff.organizationId,
      r: handoff.serviceRecordId,
      c: handoff.concernId,
      // Left out of an ordinary code, so those stay as short as they were.
      ...(handoff.purpose === 'dropoff' ? { k: 'dropoff' } : {}),
      u: handoff.userId,
      e: expiresAt,
    })
  ).toString('base64url')
  return { token: `${PREFIX}.${body}.${sign(body)}`, expiresAt: new Date(expiresAt * 1000) }
}

export type PhotoHandoffCheck =
  | { ok: true; handoff: PhotoHandoff }
  | { ok: false; reason: 'invalid' | 'expired' }

/** Reads a token back. Expiry is told apart from a bad token so the phone can say which. */
export function verifyPhotoHandoffToken(token: string, now = Date.now()): PhotoHandoffCheck {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'invalid' }
  const [, body, signature] = parts
  const expected = sign(body)
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return { ok: false, reason: 'invalid' }
  }

  let payload: { o?: unknown; r?: unknown; c?: unknown; k?: unknown; u?: unknown; e?: unknown }
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const { o, r, c, k, u, e } = payload
  if (
    typeof o !== 'string' ||
    typeof r !== 'string' ||
    typeof u !== 'string' ||
    typeof e !== 'number' ||
    (c !== null && typeof c !== 'string') ||
    (k !== undefined && k !== 'dropoff')
  ) {
    return { ok: false, reason: 'invalid' }
  }
  if (e * 1000 <= now) return { ok: false, reason: 'expired' }
  return {
    ok: true,
    handoff: {
      organizationId: o,
      serviceRecordId: r,
      concernId: c,
      purpose: k === 'dropoff' ? 'dropoff' : 'photos',
      userId: u,
      expiresAt: e,
    },
  }
}
