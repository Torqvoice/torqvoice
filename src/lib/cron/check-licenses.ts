import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { notify } from '@/lib/notify'

const TORQVOICE_COM_URL = process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'
const EXPIRY_WARNING_DAYS = 14

export async function revalidateOrganizationLicense(organizationId: string, licenseKey: string) {
  let valid = false
  let plan = 'free'
  let expiresAt = ''

  const response = await fetch(`${TORQVOICE_COM_URL}/api/license/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: licenseKey, organizationId }),
    signal: AbortSignal.timeout(10000),
  })

  if (response.ok) {
    const data = await response.json()
    valid = data.valid === true
    if (valid && data.plan) plan = data.plan
    if (data.expiresAt) expiresAt = data.expiresAt
  }

  const now = new Date().toISOString()
  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId },
    select: { userId: true },
  })

  if (!orgMember) return

  const upserts = [
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.valid' } },
      update: { value: String(valid) },
      create: { userId: orgMember.userId, organizationId, key: 'license.valid', value: String(valid) },
    }),
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.checkedAt' } },
      update: { value: now },
      create: { userId: orgMember.userId, organizationId, key: 'license.checkedAt', value: now },
    }),
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.plan' } },
      update: { value: plan },
      create: { userId: orgMember.userId, organizationId, key: 'license.plan', value: plan },
    }),
  ]

  if (expiresAt) {
    upserts.push(
      db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key: 'license.expiresAt' } },
        update: { value: expiresAt },
        create: { userId: orgMember.userId, organizationId, key: 'license.expiresAt', value: expiresAt },
      })
    )
  }

  await db.$transaction(upserts)

  // Send expiry warning if within threshold
  if (valid && expiresAt) {
    const diff = new Date(expiresAt).getTime() - Date.now()
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (daysLeft <= EXPIRY_WARNING_DAYS && daysLeft > 0) {
      await sendExpiryWarning(organizationId, daysLeft)
    }
  }
}

export async function sendExpiryWarning(organizationId: string, daysLeft: number) {
  // Check if we already warned today
  const lastWarning = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: 'license.lastExpiryWarning' } },
    select: { value: true },
  })
  const today = new Date().toISOString().slice(0, 10)
  if (lastWarning?.value === today) return

  // Record that we warned today
  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId },
    select: { userId: true },
  })
  if (!orgMember) return

  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: 'license.lastExpiryWarning' } },
    update: { value: today },
    create: { userId: orgMember.userId, organizationId, key: 'license.lastExpiryWarning', value: today },
  })

  // In-app notification
  await notify({
    type: 'license_expiring',
    title: `License expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    message: 'Please renew your license to maintain full access to all features.',
    entityType: 'license',
    entityId: organizationId,
    entityUrl: '/settings/license',
    organizationId,
  })

  // Email notification to org owner
  try {
    const owner = await db.organizationMember.findFirst({
      where: { organizationId, role: 'owner' },
      include: { user: { select: { email: true } } },
    })
    if (!owner?.user.email) return

    const from = await getOrgFromAddress(organizationId)
    await sendOrgMail(organizationId, {
      from,
      to: owner.user.email,
      subject: `Your license expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d97706;">License Expiration Notice</h2>
          <p>Your license will expire in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>
          <p>Please renew your license to continue using all features without interruption.</p>
          <p>You can manage your license in <strong>Settings &gt; License</strong>.</p>
        </div>
      `,
    })
  } catch (error) {
    console.warn(`[cron] Failed to send license expiry email for org ${organizationId}:`, error)
  }
}

/** Revalidates all license keys against torqvoice.com daily at 00:00 UTC */
export function checkLicenses() {
  const job = new CronJob('0 0 * * *', async () => {
    try {
      const licenseSettings = await db.appSetting.findMany({
        where: { key: 'license.key' },
        select: { organizationId: true, value: true },
      })

      for (const setting of licenseSettings) {
        if (!setting.organizationId) continue
        try {
          await revalidateOrganizationLicense(setting.organizationId, setting.value)
        } catch (error) {
          console.error(`[cron] Failed to revalidate license for org ${setting.organizationId}:`, error)
        }
      }
    } catch (error) {
      console.error('[cron] License revalidation failed:', error)
    }
  })

  job.start()
}
