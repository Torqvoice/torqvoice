import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getFeatures, PLAN_FEATURES, type Plan } from '@/lib/features'
import { isCloudLinked } from '@/lib/torqvoice-com-link'
import { SubscriptionSettings } from '@/features/subscription/Components/subscription-settings'
import { countCustomersTowardLimit } from '@/lib/customer-limit'
import { fetchBillingPrices, isTorqvoiceComBillingConfigured } from '@/lib/torqvoice-com'

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string }>
}) {
  // Only the app torqvoice.com bills for has this page; an install that
  // merely set TORQVOICE_MODE=cloud is sent back to settings.
  if (!(await isCloudLinked())) {
    redirect('/settings')
  }

  const authContext = await getAuthContext()
  if (!authContext) redirect('/auth/sign-in')

  // torqvoice.com sends the customer back here after a completed checkout.
  const { subscription: checkoutFlag } = await searchParams
  const justPurchased = checkoutFlag === 'success'

  const subscription = await db.subscription.findUnique({
    where: { organizationId: authContext.organizationId },
    include: { plan: true },
  })

  // Plan rows are named per price ("Torq Pro (monthly)", "Enterprise
  // (annual)"), so the plan is the word in the name, as getFeatures reads it.
  const plan: Plan =
    subscription?.status === 'active' || subscription?.status === 'trialing'
      ? subscription.plan.name.toLowerCase().includes('enterprise')
        ? 'enterprise'
        : 'pro'
      : 'free'

  // A demo is a trialing subscription not backed by Stripe (granted from the
  // admin panel). It carries full plan features but expires at currentPeriodEnd.
  const isDemo = subscription?.status === 'trialing' && !subscription?.stripeSubscriptionId

  // The member meter shows the limit that is enforced, which for a workshop
  // with a team size agreed by hand is higher than its plan's.
  const enforced = await getFeatures(authContext.organizationId)
  const features = { ...PLAN_FEATURES[plan], maxUsers: enforced.maxUsers }

  const canBuy = plan === 'free' || isDemo
  const [customerCount, memberCount, prices] = await Promise.all([
    countCustomersTowardLimit(authContext.organizationId),
    db.organizationMember.count({
      where: { organizationId: authContext.organizationId },
    }),
    // Only a page with buy buttons needs the amounts.
    canBuy ? fetchBillingPrices(authContext.organizationId) : Promise.resolve(null),
  ])

  return (
    <SubscriptionSettings
      plan={plan}
      isDemo={isDemo}
      status={subscription?.status ?? null}
      cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
      currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
      currentPeriodStart={subscription?.currentPeriodStart?.toISOString() ?? null}
      planPrice={subscription?.plan.price ?? 0}
      planInterval={subscription?.plan.interval ?? 'year'}
      hasStripeCustomer={!!subscription?.stripeCustomerId}
      justPurchased={justPurchased}
      accountLinkAvailable={isTorqvoiceComBillingConfigured()}
      usage={{ customers: customerCount, members: memberCount }}
      features={features}
      prices={prices}
    />
  )
}
