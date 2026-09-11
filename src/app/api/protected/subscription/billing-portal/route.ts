import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe-config'
import { isDemoMode } from '@/lib/demo'

export async function POST() {
  try {
    if (isDemoMode) {
      return NextResponse.json({ error: 'This action is disabled on the demo.' }, { status: 403 })
    }

    // The active organisation from the session, and only its owners and
    // admins: this moves money and changes the plan.
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const membership = { organizationId: ctx.organizationId }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: membership.organizationId },
      select: { stripeCustomerId: true },
    })

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const stripe = await getStripeClient()

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings/subscription`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('[Billing Portal] Error:', error)
    const message = 'Failed to create billing portal session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
