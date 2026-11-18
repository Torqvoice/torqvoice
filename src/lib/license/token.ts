import type { KeyObject } from 'node:crypto'
import { embeddedKeys, signedPayload } from './signature'

/**
 * Verifies the signed licence tokens torqvoice.com hands out.
 *
 * Nothing in the local database is trusted on its own. A token carries the
 * organization it was minted for and only a valid signature over all of it
 * unlocks branding removal. See torqvoice.com `src/lib/license-signing.ts`
 * for the signer.
 *
 * Two kinds of token exist, told apart by their prefix so one can never be
 * read as the other:
 *
 * `tvl1`, the subscription token. torqvoice.com re-signs it on every daily
 * check, and two clocks apply:
 * - `expiresAt` is the licence term itself.
 * - `issuedAt` must be recent. A token older than LICENSE_TOKEN_MAX_AGE_DAYS
 *   means the app has not been able to reach torqvoice.com for that long, or
 *   somebody has cut it off deliberately. Either way branding comes back
 *   until a fresh token arrives. The header warns from
 *   LICENSE_TOKEN_WARN_AGE_DAYS so a genuine outage never surprises a paying
 *   customer.
 *
 * `tvp1`, the perpetual (offline) token. Bought once, issued by hand, pasted
 * into Settings, License, and verified here with no network call ever. It
 * has no expiry and no staleness check. What binds it instead is the
 * licensee: the token names the workshop's registration number (the field
 * printed on its invoices) and only verifies while the workshop's own
 * setting still matches. A token copied to another install would force that
 * install to print the licensee's tax number on its invoices. The token also
 * carries how many workshops the install may run, so a perpetual licence is
 * never an unlimited one.
 */

export const LICENSE_TOKEN_PREFIX = 'tvl1'
export const PERPETUAL_LICENSE_TOKEN_PREFIX = 'tvp1'
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

export type PerpetualLicensee = {
  /** display only: "Licensed to NAME" */
  name: string
  /** enforced against the workshop's own organization number setting */
  registrationNumber: string
  /** ISO 3166-1 alpha-2, display only */
  country: string
}

export type PerpetualLicensePayload = {
  v: 1
  lid: string
  org: string
  plan: string
  /** how many workshops this install may run; 1 for every licence sold so far */
  maxOrganizations: number
  licensee: PerpetualLicensee
  /** informational: when the token was signed */
  issuedAt: string
}

export type LicenseTokenKind = 'subscription' | 'perpetual'

export type LicenseTokenStatus =
  /** no token stored */
  | 'missing'
  /** malformed, bad signature, or minted for another organization */
  | 'invalid'
  /** signature fine, licence term is over (subscription only) */
  | 'expired'
  /** signature fine, but not refreshed within LICENSE_TOKEN_MAX_AGE_DAYS (subscription only) */
  | 'stale'
  /** signature fine, but the workshop's registration number is not the licensee's (perpetual only) */
  | 'mismatch'
  | 'valid'

export type LicenseTokenVerification = {
  status: LicenseTokenStatus
  /** which kind of token this was; null when it could not be read at all */
  kind: LicenseTokenKind | null
  /** present whenever the signature checked out, whatever the status */
  payload: LicenseTokenPayload | PerpetualLicensePayload | null
  /** whole days since the token was signed; null without a payload */
  ageDays: number | null
  /** whole days until the licence term ends; null without a payload or for a perpetual token */
  daysUntilExpiry: number | null
  /** ISO 8601 end of term; null for a perpetual token or without a payload */
  expiresAt: string | null
  /** workshops the install may run under this token; null unless the token says */
  maxOrganizations: number | null
  /** who the perpetual token was issued to; null for a subscription token */
  licensee: PerpetualLicensee | null
}

export type VerifyLicenseOptions = {
  /**
   * The workshop's own organization number setting (`invoice.orgNumber`).
   * Required for a perpetual token to verify; a subscription token ignores
   * it. Pass null or undefined when the workshop has not set one.
   */
  registrationNumber?: string | null
  now?: Date
}

const NOT_VERIFIED: LicenseTokenVerification = {
  status: 'invalid',
  kind: null,
  payload: null,
  ageDays: null,
  daysUntilExpiry: null,
  expiresAt: null,
  maxOrganizations: null,
  licensee: null,
}

/** Whether a pasted value is a perpetual token rather than a licence key. */
export function isPerpetualLicenseToken(input: string | null | undefined): boolean {
  return typeof input === 'string' && input.trim().startsWith(`${PERPETUAL_LICENSE_TOKEN_PREFIX}.`)
}

/**
 * Registration numbers are compared on letters and digits only, in upper
 * case, so "NO 123 456 789 MVA" written one way on the licence and another
 * way in Settings still match. Both sides come from the same field (the
 * request panel copies it for the order), so no country rules are needed.
 */
export function normalizeRegistrationNumber(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseSubscriptionPayload(p: Record<string, unknown>): LicenseTokenPayload | null {
  if (p.v !== 1) return null
  for (const field of ['lid', 'org', 'plan', 'expiresAt', 'issuedAt']) {
    if (!nonEmptyString(p[field])) return null
  }
  if (Number.isNaN(Date.parse(p.expiresAt as string))) return null
  if (Number.isNaN(Date.parse(p.issuedAt as string))) return null
  return p as LicenseTokenPayload
}

function parsePerpetualPayload(p: Record<string, unknown>): PerpetualLicensePayload | null {
  if (p.v !== 1) return null
  for (const field of ['lid', 'org', 'plan', 'issuedAt']) {
    if (!nonEmptyString(p[field])) return null
  }
  if (Number.isNaN(Date.parse(p.issuedAt as string))) return null
  if (
    typeof p.maxOrganizations !== 'number' ||
    !Number.isInteger(p.maxOrganizations) ||
    p.maxOrganizations < 1
  ) {
    return null
  }
  const licensee = p.licensee
  if (!licensee || typeof licensee !== 'object') return null
  const l = licensee as Record<string, unknown>
  if (
    !nonEmptyString(l.name) ||
    !nonEmptyString(l.registrationNumber) ||
    !nonEmptyString(l.country)
  ) {
    return null
  }
  // A licence bound to nothing would verify anywhere.
  if (normalizeRegistrationNumber(l.registrationNumber).length === 0) return null
  return p as PerpetualLicensePayload
}

function verifySubscription(
  keys: readonly KeyObject[],
  token: string,
  organizationId: string,
  now: Date
): LicenseTokenVerification {
  const signed = signedPayload(keys, token, LICENSE_TOKEN_PREFIX)
  const payload = signed && parseSubscriptionPayload(signed)
  if (!payload) return NOT_VERIFIED
  // A token is bound to the org that asked for it. One lifted from another
  // install, or minted for a different org on the same install, is rejected.
  if (payload.org !== organizationId) return NOT_VERIFIED

  const ageMs = now.getTime() - Date.parse(payload.issuedAt)
  const ageDays = Math.floor(ageMs / DAY_MS)
  const daysUntilExpiry = Math.ceil((Date.parse(payload.expiresAt) - now.getTime()) / DAY_MS)
  const base: Omit<LicenseTokenVerification, 'status'> = {
    kind: 'subscription',
    payload,
    ageDays,
    daysUntilExpiry,
    expiresAt: payload.expiresAt,
    maxOrganizations: null,
    licensee: null,
  }

  if (daysUntilExpiry <= 0) return { ...base, status: 'expired' }
  // A future issuedAt is a clock problem, not a forgery (the signature held),
  // so it is treated as fresh rather than rejected.
  if (ageMs > LICENSE_TOKEN_MAX_AGE_DAYS * DAY_MS) return { ...base, status: 'stale' }
  return { ...base, status: 'valid' }
}

function verifyPerpetual(
  keys: readonly KeyObject[],
  token: string,
  organizationId: string,
  registrationNumber: string | null | undefined,
  now: Date
): LicenseTokenVerification {
  const signed = signedPayload(keys, token, PERPETUAL_LICENSE_TOKEN_PREFIX)
  const payload = signed && parsePerpetualPayload(signed)
  if (!payload) return NOT_VERIFIED
  if (payload.org !== organizationId) return NOT_VERIFIED

  const base: Omit<LicenseTokenVerification, 'status'> = {
    kind: 'perpetual',
    payload,
    ageDays: Math.floor((now.getTime() - Date.parse(payload.issuedAt)) / DAY_MS),
    daysUntilExpiry: null,
    expiresAt: null,
    maxOrganizations: payload.maxOrganizations,
    licensee: payload.licensee,
  }

  // The binding that replaces the daily refresh: the workshop must still be
  // the business the licence was issued to. An empty setting never matches.
  const expected = normalizeRegistrationNumber(payload.licensee.registrationNumber)
  const actual = normalizeRegistrationNumber(registrationNumber)
  if (actual.length === 0 || actual !== expected) return { ...base, status: 'mismatch' }

  return { ...base, status: 'valid' }
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
  options: VerifyLicenseOptions = {}
): LicenseTokenVerification {
  if (!token) return { ...NOT_VERIFIED, status: 'missing' }
  const now = options.now ?? new Date()
  if (isPerpetualLicenseToken(token)) {
    return verifyPerpetual(keys, token, organizationId, options.registrationNumber, now)
  }
  return verifySubscription(keys, token, organizationId, now)
}

export function verifyLicenseToken(
  token: string | null | undefined,
  organizationId: string,
  options: VerifyLicenseOptions = {}
): LicenseTokenVerification {
  return verifyLicenseTokenWith(embeddedKeys(), token, organizationId, options)
}
