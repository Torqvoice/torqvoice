import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { getStripeClient, getStripeConfig } from '@/lib/stripe-config'

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
    const membership = { organizationId: ctx.organizationId }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: membership.organizationId },
    })

    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 })
    }

    const config = await getStripeConfig()
    const newPriceId = config.enterprisePriceId

    if (!newPriceId) {
      return NextResponse.json({ error: 'Enterprise price ID not configured' }, { status: 500 })
    }

    const stripe = await getStripeClient()

    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    )

    const currentItem = stripeSubscription.items.data[0]
    if (!currentItem) {
      return NextResponse.json({ error: 'No subscription item found' }, { status: 400 })
    }

    const proration_date = Math.floor(Date.now() / 1000)

    const preview = await stripe.invoices.createPreview({
      customer: subscription.stripeCustomerId,
      subscription: subscription.stripeSubscriptionId,
      subscription_details: {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_date,
      },
    })

    // Only sum proration line items, not regular subscription charges
    // which represent the next renewal period.
    const prorationAmount = preview.lines.data
      .filter((line) => {
        const parent = line.parent
        if (!parent) return false
        if (parent.type === 'invoice_item_details') {
          return parent.invoice_item_details?.proration === true
        }
        if (parent.type === 'subscription_item_details') {
          return parent.subscription_item_details?.proration === true
        }
        return false
      })
      .reduce((sum, line) => sum + line.amount, 0)

    return NextResponse.json({
      amountDue: Math.max(0, prorationAmount) / 100,
      currency: preview.currency,
      prorationDate: proration_date,
    })
  } catch (error) {
    console.error('[Subscription Upgrade Preview] Error:', error)
    console.error('[subscription]', error)
    const message = 'Preview failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
