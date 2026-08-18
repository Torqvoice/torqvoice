import { db } from '@/lib/db'

/** Length of the free trial offered on a first subscription. */
export const TRIAL_PERIOD_DAYS = 14

/**
 * An organization qualifies for the 14-day free trial only if it has never
 * had a subscription row. Subscription rows persist after cancellation (and
 * admin-granted demos also create one), so the existence of any row means
 * the org already used its trial or already subscribed.
 *
 * Used by the checkout route (to decide whether to add a trial to the Stripe
 * Checkout session) and by the subscription settings page (to decide whether
 * the upgrade buttons start a trial or a paid subscription).
 */
export async function isTrialEligible(organizationId: string): Promise<boolean> {
  const existing = await db.subscription.findUnique({
    where: { organizationId },
    select: { id: true },
  })
  return existing === null
}
