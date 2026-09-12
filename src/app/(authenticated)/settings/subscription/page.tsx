import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { PLAN_FEATURES, type Plan } from '@/lib/features'
import { isCloudLinked } from '@/lib/torqvoice-com-link'
import { SubscriptionSettings } from '@/features/subscription/Components/subscription-settings'
import { countCustomersTowardLimit } from '@/lib/customer-limit'
import { isTorqvoiceComBillingConfigured } from '@/lib/torqvoice-com'

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

  const plan: Plan =
    subscription?.status === 'active' || subscription?.status === 'trialing'
      ? subscription.plan.name.toLowerCase() === 'enterprise'
        ? 'enterprise'
        : 'pro'
      : 'free'

  // A demo is a trialing subscription not backed by Stripe (granted from the
  // admin panel). It carries full plan features but expires at currentPeriodEnd.
  const isDemo = subscription?.status === 'trialing' && !subscription?.stripeSubscriptionId

  const features = PLAN_FEATURES[plan]

  const [customerCount, memberCount] = await Promise.all([
    countCustomersTowardLimit(authContext.organizationId),
    db.organizationMember.count({
      where: { organizationId: authContext.organizationId },
    }),
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
    />
  )
}
