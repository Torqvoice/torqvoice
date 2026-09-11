import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { LICENSE_PUBLIC_KEYS } from './public-keys'

/**
 * Verifies the signed licence token torqvoice.com hands out.
 *
 * Nothing in the local database is trusted on its own. The token carries the
 * organization it was minted for, the plan, the expiry and the time it was
 * signed, and only a valid signature over all of that unlocks branding
 * removal. See torqvoice.com `src/lib/license-signing.ts` for the signer.
 *
 * Two clocks apply:
 * - `expiresAt` is the licence term itself.
 * - `issuedAt` must be recent. torqvoice.com re-signs on every daily check,
 *   so a token older than LICENSE_TOKEN_MAX_AGE_DAYS means the app has not
 *   been able to reach torqvoice.com for that long, or somebody has cut it
 *   off deliberately. Either way branding comes back until a fresh token
 *   arrives. The header warns from LICENSE_TOKEN_WARN_AGE_DAYS so a genuine
 *   outage never surprises a paying customer.
 */

export const LICENSE_TOKEN_PREFIX = 'tvl1'
export const LICENSE_TOKEN_MAX_AGE_DAYS = 14
export const LICENSE_TOKEN_WARN_AGE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export type LicenseTokenPayload = {
  v: 1
  lid: string
  org: string
  plan: string
  expiresAt: string
  issuedAt: string
}

export type LicenseTokenStatus =
  /** no token stored */
  | 'missing'
  /** malformed, bad signature, or minted for another organization */
  | 'invalid'
  /** signature fine, licence term is over */
  | 'expired'
  /** signature fine, but not refreshed within LICENSE_TOKEN_MAX_AGE_DAYS */
  | 'stale'
  | 'valid'

export type LicenseTokenVerification = {
  status: LicenseTokenStatus
  /** present whenever the signature checked out, whatever the status */
  payload: LicenseTokenPayload | null
  /** whole days since the token was signed; null without a payload */
  ageDays: number | null
  /** whole days until the licence term ends; null without a payload */
  daysUntilExpiry: number | null
}

const NOT_VERIFIED: LicenseTokenVerification = {
  status: 'invalid',
  payload: null,
  ageDays: null,
  daysUntilExpiry: null,
}

let cachedKeys: KeyObject[] | null = null

function embeddedKeys(): KeyObject[] {
  if (!cachedKeys) {
    cachedKeys = LICENSE_PUBLIC_KEYS.map((k) =>
      createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' })
    )
  }
  return cachedKeys
}

function parsePayload(encoded: string): LicenseTokenPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  if (p.v !== 1) return null
  for (const field of ['lid', 'org', 'plan', 'expiresAt', 'issuedAt']) {
    if (typeof p[field] !== 'string' || !(p[field] as string)) return null
  }
  if (Number.isNaN(Date.parse(p.expiresAt as string))) return null
  if (Number.isNaN(Date.parse(p.issuedAt as string))) return null
  return p as LicenseTokenPayload
}

/**
 * Verifies with an explicit key set. Tests use this with a throwaway pair;
 * production code goes through `verifyLicenseToken`, which pins the embedded
 * keys.
 */
export function verifyLicenseTokenWith(
  keys: readonly KeyObject[],
  token: string | null | undefined,
  organizationId: string,
  now: Date = new Date()
): LicenseTokenVerification {
  if (!token) return { ...NOT_VERIFIED, status: 'missing' }

  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== LICENSE_TOKEN_PREFIX) return NOT_VERIFIED
  const [, encoded, sig] = parts

  let signature: Buffer
  try {
    signature = Buffer.from(sig, 'base64url')
  } catch {
    return NOT_VERIFIED
  }
  if (signature.length !== 64) return NOT_VERIFIED

  const data = Buffer.from(encoded, 'utf8')
  const signed = keys.some((key) => {
    try {
      return verify(null, data, key, signature)
    } catch {
      return false
    }
  })
  if (!signed) return NOT_VERIFIED

  const payload = parsePayload(encoded)
  if (!payload) return NOT_VERIFIED
  // A token is bound to the org that asked for it. One lifted from another
  // install, or minted for a different org on the same install, is rejected.
  if (payload.org !== organizationId) return NOT_VERIFIED

  const ageMs = now.getTime() - Date.parse(payload.issuedAt)
  const ageDays = Math.floor(ageMs / DAY_MS)
  const daysUntilExpiry = Math.ceil((Date.parse(payload.expiresAt) - now.getTime()) / DAY_MS)
  const base = { payload, ageDays, daysUntilExpiry }

  if (daysUntilExpiry <= 0) return { ...base, status: 'expired' }
  // A future issuedAt is a clock problem, not a forgery (the signature held),
  // so it is treated as fresh rather than rejected.
  if (ageMs > LICENSE_TOKEN_MAX_AGE_DAYS * DAY_MS) return { ...base, status: 'stale' }
  return { ...base, status: 'valid' }
}

export function verifyLicenseToken(
  token: string | null | undefined,
  organizationId: string,
  now: Date = new Date()
): LicenseTokenVerification {
  return verifyLicenseTokenWith(embeddedKeys(), token, organizationId, now)
}
