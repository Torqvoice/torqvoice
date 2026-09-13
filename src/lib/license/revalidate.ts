import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { verifyLicenseToken, type LicenseTokenVerification } from './token'
import { torqvoiceComUrl } from '@/lib/torqvoice-com'

/**
 * Talks to torqvoice.com and stores what comes back.
 *
 * Shared by the manual Validate button, the daily cron and the self-heal in
 * `getFeatures`. Only the signed token matters for entitlements; the plain
 * rows (`license.valid`, `license.plan`, `license.expiresAt`) are kept as a
 * display cache for the licence page and mean nothing to the feature gate.
 */

export type RemoteLicenseResult = {
  reachable: boolean
  valid: boolean
  plan: string
  expiresAt: string
  token: string | null
  error?: string
}

export async function fetchRemoteLicense(
  licenseKey: string,
  organizationId: string
): Promise<RemoteLicenseResult> {
  try {
    const response = await fetch(`${torqvoiceComUrl()}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey, organizationId }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      return { reachable: false, valid: false, plan: 'free', expiresAt: '', token: null }
    }
    const data = await response.json()
    const valid = data.valid === true
    return {
      reachable: true,
      valid,
      plan: valid && typeof data.plan === 'string' ? data.plan : 'free',
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
      token: valid && typeof data.token === 'string' ? data.token : null,
      error: typeof data.error === 'string' ? data.error : undefined,
    }
  } catch {
    return { reachable: false, valid: false, plan: 'free', expiresAt: '', token: null }
  }
}

async function settingUserId(organizationId: string): Promise<string | null> {
  const member = await db.organizationMember.findFirst({
    where: { organizationId },
    select: { userId: true },
  })
  return member?.userId ?? null
}

function upsert(organizationId: string, userId: string, key: string, value: string) {
  return db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value },
    create: { userId, organizationId, key, value },
  })
}

/**
 * Stores a validate response. A reachable answer is authoritative, including
 * "not valid": the token is dropped. An unreachable torqvoice.com changes
 * nothing except `license.checkedAt`, so the existing token keeps working
 * until it ages out on its own.
 */
export async function storeRemoteLicense(
  organizationId: string,
  licenseKey: string,
  result: RemoteLicenseResult,
  userId?: string
): Promise<void> {
  const uid = userId ?? (await settingUserId(organizationId))
  if (!uid) return

  const now = new Date().toISOString()
  const writes: Prisma.PrismaPromise<unknown>[] = [
    upsert(organizationId, uid, SETTING_KEYS.LICENSE_KEY, licenseKey),
    upsert(organizationId, uid, SETTING_KEYS.LICENSE_CHECKED_AT, now),
  ]

  if (result.reachable) {
    writes.push(
      upsert(organizationId, uid, SETTING_KEYS.LICENSE_VALID, String(result.valid)),
      upsert(organizationId, uid, SETTING_KEYS.LICENSE_PLAN, result.plan)
    )
    if (result.expiresAt) {
      writes.push(upsert(organizationId, uid, SETTING_KEYS.LICENSE_EXPIRES_AT, result.expiresAt))
    }
    if (result.token) {
      writes.push(upsert(organizationId, uid, SETTING_KEYS.LICENSE_TOKEN, result.token))
    } else {
      writes.push(
        db.appSetting.deleteMany({
          where: { organizationId, key: SETTING_KEYS.LICENSE_TOKEN },
        })
      )
    }
  }

  await db.$transaction(writes)
}

/** Fetches and stores in one go. Returns the verification of what is now on disk. */
export async function revalidateLicense(
  organizationId: string,
  licenseKey: string,
  userId?: string
): Promise<{ remote: RemoteLicenseResult; verification: LicenseTokenVerification }> {
  const remote = await fetchRemoteLicense(licenseKey, organizationId)
  await storeRemoteLicense(organizationId, licenseKey, remote, userId)
  const stored = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.LICENSE_TOKEN } },
    select: { value: true },
  })
  return { remote, verification: verifyLicenseToken(stored?.value, organizationId) }
}

// One attempt per org per hour from the request path. The cron does the real
// work daily; this only catches installs that have a key and no usable token,
// which is every existing customer on the release that introduced tokens.
const SELF_HEAL_INTERVAL_MS = 60 * 60 * 1000
const lastSelfHeal = new Map<string, number>()

/**
 * Fire-and-forget refresh for an org whose stored token is missing or stale
 * but which has a licence key. Never awaited by the caller and never throws.
 */
export function scheduleLicenseSelfHeal(organizationId: string, licenseKey: string): void {
  const last = lastSelfHeal.get(organizationId) ?? 0
  if (Date.now() - last < SELF_HEAL_INTERVAL_MS) return
  lastSelfHeal.set(organizationId, Date.now())
  void revalidateLicense(organizationId, licenseKey).catch((error) => {
    console.warn(`[license] Background refresh failed for org ${organizationId}:`, error)
  })
}

/** Test hook. */
export function resetLicenseSelfHealThrottle(): void {
  lastSelfHeal.clear()
}
