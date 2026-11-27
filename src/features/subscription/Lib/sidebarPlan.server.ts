import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { PLAN_FEATURES } from '@/lib/features'
import { getAuthContext } from '@/lib/get-auth-context'
import { countCustomersTowardLimit } from '@/lib/customer-limit'
import { isCloudLinked } from '@/lib/torqvoice-com-link'
import { currentPlan } from './currentPlan'

/**
 * What the plan row at the foot of the sidebar shows, or nothing.
 *
 * A free workshop sees its plan and how many of its customers it has used;
 * a demo sees which plan it is trying and how long it has left.
 */
export type SidebarPlan =
  | { kind: 'free'; customers: number; customerLimit: number }
  | { kind: 'demo'; plan: 'pro' | 'enterprise'; daysLeft: number | null }

/**
 * The sidebar's plan row, for the signed-in account's active workshop.
 *
 * Shown on the same terms as a purchase: the app torqvoice.com bills for
 * (as the plans page decides), a workshop the plans page would offer to
 * sell to (free, or a demo without Stripe), and someone the checkout route
 * would let buy (an owner or an admin). A paid workshop, a member, a
 * self-hosted install and the public demo get nothing.
 */
export async function getSidebarPlan(): Promise<SidebarPlan | null> {
  // The checkout route refuses on the public demo.
  if (isDemoMode) return null
  if (!(await isCloudLinked())) return null

  const ctx = await getAuthContext()
  if (!ctx?.isAdmin) return null

  const subscription = await db.subscription.findUnique({
    where: { organizationId: ctx.organizationId },
    select: {
      status: true,
      stripeSubscriptionId: true,
      currentPeriodEnd: true,
      plan: { select: { name: true } },
    },
  })
  const { plan, isDemo } = currentPlan(subscription)

  if (isDemo && plan !== 'free') {
    const end = subscription?.currentPeriodEnd
    return {
      kind: 'demo',
      plan,
      // Whole days left, as the plans page counts them.
      daysLeft: end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000)) : null,
    }
  }

  if (plan !== 'free') return null

  return {
    kind: 'free',
    customers: await countCustomersTowardLimit(ctx.organizationId),
    customerLimit: PLAN_FEATURES.free.maxCustomers,
  }
}
