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
 * A perpetual token is stored here too, but never talks to torqvoice.com.
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
 * The licence on disk, verified the way the feature gate verifies it: the
 * stored token against the workshop's own registration number.
 */
export async function storedLicenseVerification(
  organizationId: string
): Promise<LicenseTokenVerification> {
  const rows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: [SETTING_KEYS.LICENSE_TOKEN, SETTING_KEYS.INVOICE_ORG_NUMBER] },
    },
    select: { key: true, value: true },
  })
  const token = rows.find((r) => r.key === SETTING_KEYS.LICENSE_TOKEN)?.value
  const registrationNumber = rows.find((r) => r.key === SETTING_KEYS.INVOICE_ORG_NUMBER)?.value
  return verifyLicenseToken(token, organizationId, { registrationNumber })
}

export type RemoteStoreOptions = {
  /**
   * From the Validate button only. A key torqvoice.com accepts may then
   * replace a perpetual token, because the owner typed it in on purpose. The
   * cron and the self-heal never pass it, so no refresh can touch an offline
   * licence.
   */
  replacePerpetual?: boolean
}

/**
 * Stores a validate response. A reachable answer is authoritative, including
 * "not valid": the token is dropped. An unreachable torqvoice.com changes
 * nothing except `license.checkedAt`, so the existing token keeps working
 * until it ages out on its own.
 *
 * Except over a perpetual token. One on disk is read inside the same
 * transaction as the writes, so a refresh that was already in flight when the
 * token was pasted cannot land on top of it, and a mistyped key, a rejected
 * key or an unreachable torqvoice.com never costs a paid offline licence.
 * Only a key torqvoice.com accepts, typed in by the owner, replaces it.
 *
 * Returns whether anything was written.
 */
export async function storeRemoteLicense(
  organizationId: string,
  licenseKey: string,
  result: RemoteLicenseResult,
  userId?: string,
  options: RemoteStoreOptions = {}
): Promise<boolean> {
  const uid = userId ?? (await settingUserId(organizationId))
  if (!uid) return false

  const now = new Date().toISOString()
  const accepted = result.reachable && result.valid && Boolean(result.token)

  return db.$transaction(async (tx) => {
    const current = await tx.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: SETTING_KEYS.LICENSE_TOKEN } },
      select: { value: true },
    })
    const onDisk = verifyLicenseToken(current?.value, organizationId)
    if (onDisk.kind === 'perpetual' && !(options.replacePerpetual && accepted)) {
      return false
    }

    const put = (key: string, value: string) =>
      tx.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: { userId: uid, organizationId, key, value },
      })

    const writes: Promise<unknown>[] = [
      put(SETTING_KEYS.LICENSE_KEY, licenseKey),
      put(SETTING_KEYS.LICENSE_CHECKED_AT, now),
    ]

    if (result.reachable) {
      writes.push(
        put(SETTING_KEYS.LICENSE_VALID, String(result.valid)),
        put(SETTING_KEYS.LICENSE_PLAN, result.plan)
      )
      if (result.expiresAt) {
        writes.push(put(SETTING_KEYS.LICENSE_EXPIRES_AT, result.expiresAt))
      }
      if (result.token) {
        writes.push(put(SETTING_KEYS.LICENSE_TOKEN, result.token))
      } else {
        writes.push(
          tx.appSetting.deleteMany({
            where: { organizationId, key: SETTING_KEYS.LICENSE_TOKEN },
          })
        )
      }
    }

    await Promise.all(writes)
    return true
  })
}

/**
 * Fetches and stores in one go. Returns the verification of what is now on
 * disk. `remote` is null when nothing was fetched: a refresh (no
 * `replacePerpetual`) finds a perpetual token on disk and has nothing to do,
 * since that licence never checks in.
 */
export async function revalidateLicense(
  organizationId: string,
  licenseKey: string,
  userId?: string,
  options: RemoteStoreOptions = {}
): Promise<{ remote: RemoteLicenseResult | null; verification: LicenseTokenVerification }> {
  if (!options.replacePerpetual) {
    const before = await storedLicenseVerification(organizationId)
    if (before.kind === 'perpetual') return { remote: null, verification: before }
  }
  const remote = await fetchRemoteLicense(licenseKey, organizationId)
  await storeRemoteLicense(organizationId, licenseKey, remote, userId, options)
  return { remote, verification: await storedLicenseVerification(organizationId) }
}

/**
 * Stores a pasted perpetual token. Nothing goes over the network: the token
 * verifies on its own against the workshop's registration number.
 *
 * A token whose signature holds but whose licensee does not match the
 * workshop's `invoice.orgNumber` is stored anyway. The License page can then
 * tell the owner which number the licence names, and the gate opens on its
 * own once Company settings are corrected, without pasting the token again.
 * Only a token that does not verify at all is refused.
 *
 * The licence key and its term are dropped: a perpetual licence replaces a
 * subscription, and a leftover key would have the cron fetch a subscription
 * token over the top of it.
 */
export async function storePerpetualLicense(
  organizationId: string,
  token: string,
  userId?: string
): Promise<LicenseTokenVerification> {
  const orgNumber = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.INVOICE_ORG_NUMBER } },
    select: { value: true },
  })
  const verification = verifyLicenseToken(token, organizationId, {
    registrationNumber: orgNumber?.value,
  })
  if (verification.status !== 'valid' && verification.status !== 'mismatch') {
    return verification
  }

  const uid = userId ?? (await settingUserId(organizationId))
  if (!uid) return verification

  await db.$transaction([
    upsert(organizationId, uid, SETTING_KEYS.LICENSE_TOKEN, token),
    db.appSetting.deleteMany({
      where: {
        organizationId,
        key: { in: [SETTING_KEYS.LICENSE_KEY, SETTING_KEYS.LICENSE_EXPIRES_AT] },
      },
    }),
    upsert(
      organizationId,
      uid,
      SETTING_KEYS.LICENSE_VALID,
      String(verification.status === 'valid')
    ),
    upsert(organizationId, uid, SETTING_KEYS.LICENSE_PLAN, verification.payload?.plan ?? 'free'),
    upsert(organizationId, uid, SETTING_KEYS.LICENSE_CHECKED_AT, new Date().toISOString()),
  ])
  return verification
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
