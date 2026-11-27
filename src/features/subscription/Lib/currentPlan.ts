/** The plans torqvoice.com sells to the cloud app. */
export type CloudPlan = 'free' | 'pro' | 'enterprise'

type SubscriptionRow = {
  status: string
  stripeSubscriptionId: string | null
  plan: { name: string }
} | null

/**
 * The plan a workshop's subscription row puts it on, as the plans page shows
 * it, and whether that is a demo.
 *
 * Plan rows are named per price ("Torq Pro (monthly)", "Enterprise
 * (annual)"), so the plan is the word in the name, as getFeatures reads it.
 * A demo is a trialing subscription not backed by Stripe (granted from the
 * admin panel): it carries full plan features but expires at
 * currentPeriodEnd, and can still be bought.
 */
export function currentPlan(subscription: SubscriptionRow): { plan: CloudPlan; isDemo: boolean } {
  const plan: CloudPlan =
    subscription?.status === 'active' || subscription?.status === 'trialing'
      ? subscription.plan.name.toLowerCase().includes('enterprise')
        ? 'enterprise'
        : 'pro'
      : 'free'
  const isDemo = subscription?.status === 'trialing' && !subscription?.stripeSubscriptionId
  return { plan, isDemo }
}
