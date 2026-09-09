import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { getStripeClient, getStripeConfig } from '@/lib/stripe-config'
import { isDemoMode } from '@/lib/demo'

export async function POST(request: Request) {
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

    const body = await request.json()
    const plan = body.plan as string

    if (plan !== 'pro' && plan !== 'enterprise') {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'pro' or 'enterprise'" },
        { status: 400 }
      )
    }

    const config = await getStripeConfig()
    const priceId = plan === 'pro' ? config.proPriceId : config.enterprisePriceId

    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price ID not configured for ${plan} plan` },
        { status: 500 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const stripe = await getStripeClient()
    const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } })

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user?.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        type: 'subscription',
        plan,
        organizationId: membership.organizationId,
      },
      subscription_data: {
        metadata: {
          plan,
          organizationId: membership.organizationId,
        },
      },
      success_url: `${appUrl}/settings/subscription?subscription=success`,
      cancel_url: `${appUrl}/settings/subscription`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('[Subscription Checkout] Error:', error)
    console.error('[subscription]', error)
    const message = 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
