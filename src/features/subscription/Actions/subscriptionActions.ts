'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { billingRequest } from '@/lib/torqvoice-com'

/**
 * Cancel and resume go through torqvoice.com, which holds the Stripe keys
 * and updates this organization's subscription row before answering.
 */

async function requireStripeSubscription(organizationId: string) {
  const subscription = await db.subscription.findUnique({ where: { organizationId } })
  if (!subscription?.stripeSubscriptionId) {
    throw new Error('No active subscription found')
  }
  return subscription
}

export async function cancelSubscription() {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      demoGuard()
      if (!isAdmin) throw new Error('Only an owner or admin can change the subscription')
      await requireStripeSubscription(organizationId)
      return billingRequest<{ cancelAtPeriodEnd: boolean }>('cancel', { organizationId })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: () => ({
        action: 'subscription.cancel',
        entity: 'Subscription',
        details: { key: 'subscription_cancel' },
      }),
    }
  )
}

export async function resumeSubscription() {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      demoGuard()
      if (!isAdmin) throw new Error('Only an owner or admin can change the subscription')
      await requireStripeSubscription(organizationId)
      return billingRequest<{ cancelAtPeriodEnd: boolean }>('resume', { organizationId })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: () => ({
        action: 'subscription.resume',
        entity: 'Subscription',
        details: { key: 'subscription_resume' },
      }),
    }
  )
}
