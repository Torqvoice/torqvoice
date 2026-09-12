import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { billingErrorResponse, billingRequest } from '@/lib/torqvoice-com'

type Preview = { amountDue: number; currency: string; prorationDate: number }

/** What moving from Pro to Enterprise costs today, prorated by Stripe. */
export async function POST() {
  try {
    // The active organisation from the session, and only its owners and
    // admins: this moves money and changes the plan.
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    })

    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 })
    }

    const preview = await billingRequest<Preview>('upgrade-preview', {
      organizationId: ctx.organizationId,
    })

    return NextResponse.json(preview)
  } catch (error) {
    return billingErrorResponse(error, 'Preview failed')
  }
}
