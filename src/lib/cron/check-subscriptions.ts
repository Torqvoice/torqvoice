import { CronJob } from 'cron'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { getStripeClient, getStripeConfig } from '@/lib/stripe-config'

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

async function syncSubscription(
  stripe: Stripe,
  sub: { id: string; organizationId: string; stripeSubscriptionId: string | null; status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; plan: { name: string } },
) {
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

  if (!statusChanged && !periodEndChanged && !periodStartChanged && !cancelChanged) {
    return false
  }

  const licensePlan = resolveLicensePlan(newStatus, sub.plan.name)

  await db.$transaction([
    db.subscription.update({
      where: { id: sub.id },
      data: { status: newStatus, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd },
    }),
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId: sub.organizationId, key: 'license.plan' } },
      create: { organizationId: sub.organizationId, key: 'license.plan', value: licensePlan, userId: '' },
      update: { value: licensePlan },
    }),
  ])

  return true
}

async function cancelOrphanedSubscription(subId: string, organizationId: string) {
  await db.$transaction([
    db.subscription.update({ where: { id: subId }, data: { status: 'canceled' } }),
    db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: 'license.plan' } },
      create: { organizationId, key: 'license.plan', value: 'free', userId: '' },
      update: { value: 'free' },
    }),
  ])
}

/** Cloud mode: validates subscriptions against Stripe daily at 01:00 UTC */
export function checkSubscriptions() {
  const isCloud = process.env.TORQVOICE_MODE === 'cloud'
  if (!isCloud) return

  const job = new CronJob('0 1 * * *', async () => {
    try {
      const config = await getStripeConfig()
      if (!config.secretKey) return

      const stripe = await getStripeClient()
      const subscriptions = await db.subscription.findMany({
        where: { status: { in: ['active', 'past_due', 'trialing'] }, stripeSubscriptionId: { not: null } },
        include: { plan: true },
      })

      let synced = 0
      let errors = 0

      for (const sub of subscriptions) {
        try {
          const changed = await syncSubscription(stripe, sub)
          if (changed) synced++
        } catch (error) {
          if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
            try {
              await cancelOrphanedSubscription(sub.id, sub.organizationId)
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

      if (synced > 0 || errors > 0) {
        console.warn(`[cron] Subscription validation: ${synced} synced, ${errors} errors`)
      }
    } catch (error) {
      console.error('[cron] Subscription validation failed:', error)
    }
  })

  job.start()
}
