import { CronJob } from 'cron'
import { isCloudMode } from '@/lib/features'
import { billingRequest, isTorqvoiceComBillingConfigured } from '@/lib/torqvoice-com'
import { createLogger } from '@/lib/logger'

/**
 * Cloud mode: once a day, asks torqvoice.com to compare every Stripe-backed
 * subscription with Stripe and correct the rows here. Webhooks do the real
 * work; this catches the one that was missed.
 */
export function syncSubscriptions() {
  if (!isCloudMode()) return

  const job = new CronJob('0 1 * * *', async () => {
    if (!isTorqvoiceComBillingConfigured()) return
    try {
      const result = await billingRequest<{ checked: number; synced: number; errors: number }>(
        'sync',
        {}
      )
      if (result.synced > 0 || result.errors > 0) {
        createLogger('cron').info('Subscription sync', {
          checked: result.checked,
          synced: result.synced,
          errors: result.errors,
        })
      }
    } catch (error) {
      createLogger('cron').error('Subscription sync failed', { err: error })
    }
  })

  job.start()
}
