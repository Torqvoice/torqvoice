'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe-config'
import { demoGuard } from '@/lib/demo'

export async function cancelSubscription() {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      demoGuard()
      if (!isAdmin) throw new Error('Only an owner or admin can change the subscription')
      const subscription = await db.subscription.findUnique({
        where: { organizationId },
      })

      if (!subscription?.stripeSubscriptionId) {
        throw new Error('No active subscription found')
      }

      const stripe = await getStripeClient()

      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      })

      await db.subscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd: true },
      })

      return { cancelAtPeriodEnd: true }
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
      const subscription = await db.subscription.findUnique({
        where: { organizationId },
      })

      if (!subscription?.stripeSubscriptionId) {
        throw new Error('No active subscription found')
      }

      const stripe = await getStripeClient()

      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      })

      await db.subscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd: false },
      })

      return { cancelAtPeriodEnd: false }
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
