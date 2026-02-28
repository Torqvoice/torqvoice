import { CronJob } from 'cron'
import { db } from '@/lib/db'

const TORQVOICE_COM_URL = process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'

async function revalidateOrganizationLicense(organizationId: string, licenseKey: string) {
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
