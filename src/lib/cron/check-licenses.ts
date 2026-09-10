import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { notify } from '@/lib/notify'
import { revalidateLicense } from '@/lib/license/revalidate'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  LICENSE_TOKEN_WARN_AGE_DAYS,
  verifyLicenseToken,
} from '@/lib/license/token'

const EXPIRY_WARNING_DAYS = 14

/**
 * Re-checks one org's key against torqvoice.com and stores the signed token
 * that comes back. Then warns about whichever clock is running out: the
 * licence term, or the token's age when torqvoice.com has been unreachable.
 */
export async function revalidateOrganizationLicense(organizationId: string, licenseKey: string) {
  const { verification } = await revalidateLicense(organizationId, licenseKey)
  const { status, daysUntilExpiry, ageDays } = verification

  if (
    status === 'valid' &&
    daysUntilExpiry !== null &&
    daysUntilExpiry <= EXPIRY_WARNING_DAYS &&
    daysUntilExpiry > 0
  ) {
    await sendExpiryWarning(organizationId, daysUntilExpiry)
  }

  // Signature fine, licence not over, but no fresh token for a week: the
  // daily refresh has been failing. Say so before the ceiling cuts branding.
  if (
    (status === 'valid' || status === 'stale') &&
    ageDays !== null &&
    ageDays >= LICENSE_TOKEN_WARN_AGE_DAYS
  ) {
    await sendVerificationWarning(organizationId, Math.max(0, LICENSE_TOKEN_MAX_AGE_DAYS - ageDays))
  }
}

async function alreadyWarnedToday(organizationId: string, key: string): Promise<boolean> {
  const last = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { value: true },
  })
  const today = new Date().toISOString().slice(0, 10)
  if (last?.value === today) return true

  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId },
    select: { userId: true },
  })
  if (!orgMember) return true

  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value: today },
    create: { userId: orgMember.userId, organizationId, key, value: today },
  })
  return false
}

async function emailOwner(organizationId: string, subject: string, html: string) {
  try {
    const owner = await db.organizationMember.findFirst({
      where: { organizationId, role: 'owner' },
      include: { user: { select: { email: true } } },
    })
    if (!owner?.user.email) return

    const from = await getOrgFromAddress(organizationId)
    await sendOrgMail(organizationId, { from, to: owner.user.email, subject, html })
  } catch (error) {
    console.warn(`[cron] Failed to send license email for org ${organizationId}:`, error)
  }
}

export async function sendExpiryWarning(organizationId: string, daysLeft: number) {
  if (await alreadyWarnedToday(organizationId, 'license.lastExpiryWarning')) return

  const dayWord = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`

  await notify({
    type: 'license_expiring',
    title: `License expires in ${dayWord}`,
    message: 'Please renew your license to maintain full access to all features.',
    entityType: 'license',
    entityId: organizationId,
    entityUrl: '/settings/license',
    organizationId,
  })

  await emailOwner(
    organizationId,
    `Your license expires in ${dayWord}`,
    `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #d97706;">License Expiration Notice</h2>
          <p>Your license will expire in <strong>${dayWord}</strong>.</p>
          <p>Please renew your license to continue using all features without interruption.</p>
          <p>You can manage your license in <strong>Settings &gt; License</strong>.</p>
        </div>
      `
  )
}

export async function sendVerificationWarning(organizationId: string, daysUntilCutoff: number) {
  if (await alreadyWarnedToday(organizationId, 'license.lastVerificationWarning')) return

  const dayWord = `${daysUntilCutoff} day${daysUntilCutoff === 1 ? '' : 's'}`
  const title =
    daysUntilCutoff > 0
      ? `License could not be verified, branding returns in ${dayWord}`
      : 'License could not be verified, branding has returned'

  await notify({
    type: 'license_unverified',
    title,
    message:
      'This server has not been able to reach torqvoice.com to confirm the license. Check outbound access, then open Settings > License and choose Validate.',
    entityType: 'license',
    entityId: organizationId,
    entityUrl: '/settings/license',
    organizationId,
  })

  await emailOwner(
    organizationId,
    title,
    `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #d97706;">License Verification Notice</h2>
          <p>Your Torqvoice server has not been able to reach torqvoice.com to confirm its white-label license for more than ${LICENSE_TOKEN_WARN_AGE_DAYS} days.</p>
          <p>A license that stays unverified for ${LICENSE_TOKEN_MAX_AGE_DAYS} days is treated as inactive and Torqvoice branding returns until it is verified again. Nothing else changes and no data is affected.</p>
          <p>Please check that the server can reach <strong>torqvoice.com</strong>, then open <strong>Settings &gt; License</strong> and choose <strong>Validate</strong>.</p>
        </div>
      `
  )
}

type KeyedOrg = { organizationId: string; key: string }

async function orgsWithKeys(): Promise<KeyedOrg[]> {
  const rows = await db.appSetting.findMany({
    where: { key: 'license.key' },
    select: { organizationId: true, value: true },
  })
  return rows
    .filter((r): r is typeof r & { organizationId: string } => Boolean(r.organizationId))
    .map((r) => ({ organizationId: r.organizationId, key: r.value }))
}

async function revalidateAll(orgs: KeyedOrg[]) {
  for (const org of orgs) {
    try {
      await revalidateOrganizationLicense(org.organizationId, org.key)
    } catch (error) {
      console.error(`[cron] Failed to revalidate license for org ${org.organizationId}:`, error)
    }
  }
}

/**
 * Runs once at boot. Any org holding a key without a currently valid token
 * gets refreshed straight away rather than waiting up to a day for the cron.
 * That is the whole upgrade path for installs licensed before signed tokens
 * existed: they boot into the new release and fetch their token immediately.
 */
export async function refreshLicensesMissingTokens() {
  try {
    const orgs = await orgsWithKeys()
    if (orgs.length === 0) return
    const tokens = await db.appSetting.findMany({
      where: { key: 'license.token', organizationId: { in: orgs.map((o) => o.organizationId) } },
      select: { organizationId: true, value: true },
    })
    const tokenByOrg = new Map(tokens.map((t) => [t.organizationId, t.value]))
    const needing = orgs.filter(
      (o) =>
        verifyLicenseToken(tokenByOrg.get(o.organizationId), o.organizationId).status !== 'valid'
    )
    if (needing.length === 0) return
    await revalidateAll(needing)
  } catch (error) {
    console.error('[license] Boot-time licence refresh failed:', error)
  }
}

/** Revalidates all license keys against torqvoice.com daily at 00:00 UTC */
export function checkLicenses() {
  const job = new CronJob('0 0 * * *', async () => {
    try {
      await revalidateAll(await orgsWithKeys())
    } catch (error) {
      console.error('[cron] License revalidation failed:', error)
    }
  })

  job.start()

  // Give the database and the rest of boot a moment before going out to the
  // network. Not awaited: a slow torqvoice.com must never delay startup.
  setTimeout(() => void refreshLicensesMissingTokens(), 15_000).unref()
}
