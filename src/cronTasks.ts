import { CronJob } from 'cron'
import Stripe from 'stripe'
import { db } from './lib/db'

const TORQVOICE_COM_URL = process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'

// ---------------------------------------------------------------------------
// Cloud mode: Stripe subscription validation
// Runs daily at 01:00 UTC (offset from license check at 00:00 to spread load)
// ---------------------------------------------------------------------------

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    stripeClient = new Stripe(key)
  }
  return stripeClient
}

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    default:
      return 'canceled'
  }
}

function resolveLicensePlan(internalStatus: string, planName: string): string {
  if (internalStatus !== 'active' && internalStatus !== 'trialing') {
    return 'free'
  }
  const lower = planName.toLowerCase()
  if (lower.includes('enterprise')) return 'enterprise'
  if (lower.includes('pro')) return 'pro'
  return 'free'
}

export function checkSubscriptions() {
  const isCloud = process.env.TORQVOICE_MODE === 'cloud'
  if (!isCloud || !process.env.STRIPE_SECRET_KEY) return

  const job = new CronJob('0 1 * * *', async () => {
    try {
      const stripe = getStripe()

      const subscriptions = await db.subscription.findMany({
        where: {
          status: { in: ['active', 'past_due', 'trialing'] },
          stripeSubscriptionId: { not: null },
        },
        include: { plan: true },
      })

      let synced = 0
      let errors = 0

      for (const sub of subscriptions) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId!)

          const newStatus = mapStripeStatus(stripeSub.status)
          const currentItem = stripeSub.items.data[0]
          const periodStart = currentItem?.current_period_start
            ? new Date(currentItem.current_period_start * 1000)
            : null
          const periodEnd = currentItem?.current_period_end
            ? new Date(currentItem.current_period_end * 1000)
            : null
          const cancelAtPeriodEnd = stripeSub.cancel_at_period_end

          const statusChanged = sub.status !== newStatus
          const periodEndChanged = periodEnd?.getTime() !== sub.currentPeriodEnd?.getTime()
          const periodStartChanged = periodStart?.getTime() !== sub.currentPeriodStart?.getTime()
          const cancelChanged = sub.cancelAtPeriodEnd !== cancelAtPeriodEnd

          if (statusChanged || periodEndChanged || periodStartChanged || cancelChanged) {
            const licensePlan = resolveLicensePlan(newStatus, sub.plan.name)

            await db.$transaction([
              db.subscription.update({
                where: { id: sub.id },
                data: {
                  status: newStatus,
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                  cancelAtPeriodEnd,
                },
              }),
              db.appSetting.upsert({
                where: {
                  organizationId_key: {
                    organizationId: sub.organizationId,
                    key: 'license.plan',
                  },
                },
                create: {
                  organizationId: sub.organizationId,
                  key: 'license.plan',
                  value: licensePlan,
                  userId: '',
                },
                update: { value: licensePlan },
              }),
            ])

            synced++
          }
        } catch (error) {
          // Subscription deleted on Stripe side — we never got the webhook
          if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
            try {
              await db.$transaction([
                db.subscription.update({
                  where: { id: sub.id },
                  data: { status: 'canceled' },
                }),
                db.appSetting.upsert({
                  where: {
                    organizationId_key: {
                      organizationId: sub.organizationId,
                      key: 'license.plan',
                    },
                  },
                  create: {
                    organizationId: sub.organizationId,
                    key: 'license.plan',
                    value: 'free',
                    userId: '',
                  },
                  update: { value: 'free' },
                }),
              ])

              synced++
            } catch (dbError) {
              errors++
              console.error(`[cron] Failed to cancel orphaned subscription ${sub.id}:`, dbError)
            }
          } else {
            errors++
            console.error(`[cron] Failed to validate subscription ${sub.id}:`, error)
          }
        }
      }
    } catch (error) {
      console.error('[cron] Subscription validation failed:', error)
    }
  })

  job.start()
}

export function checkLicenses() {
  const job = new CronJob('0 0 * * *', async () => {
    try {
      // Find all organizations that have a license key stored
      const licenseSettings = await db.appSetting.findMany({
        where: { key: 'license.key' },
        select: { organizationId: true, value: true },
      })

      for (const setting of licenseSettings) {
        if (!setting.organizationId) continue

        try {
          await revalidateOrganizationLicense(setting.organizationId, setting.value)
        } catch (error) {
          console.error(
            `[cron] Failed to revalidate license for org ${setting.organizationId}:`,
            error
          )
        }
      }
    } catch (error) {
      console.error('[cron] License revalidation failed:', error)
    }
  })

  job.start()
}

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
    if (valid && data.plan) {
      plan = data.plan
    }
    if (data.expiresAt) {
      expiresAt = data.expiresAt
    }
  }

  const now = new Date().toISOString()

  // Find any user in this org to use as the setting owner
  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId },
    select: { userId: true },
  })

  if (!orgMember) return

  const upserts = [
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.valid' } },
      update: { value: String(valid) },
      create: {
        userId: orgMember.userId,
        organizationId,
        key: 'license.valid',
        value: String(valid),
      },
    }),
    db.appSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: 'license.checkedAt' },
      },
      update: { value: now },
      create: {
        userId: orgMember.userId,
        organizationId,
        key: 'license.checkedAt',
        value: now,
      },
    }),
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.plan' } },
      update: { value: plan },
      create: {
        userId: orgMember.userId,
        organizationId,
        key: 'license.plan',
        value: plan,
      },
    }),
  ]

  if (expiresAt) {
    upserts.push(
      db.appSetting.upsert({
        where: {
          organizationId_key: { organizationId, key: 'license.expiresAt' },
        },
        update: { value: expiresAt },
        create: {
          userId: orgMember.userId,
          organizationId,
          key: 'license.expiresAt',
          value: expiresAt,
        },
      })
    )
  }

  await db.$transaction(upserts)
}
