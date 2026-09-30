import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { isDemoMode } from '@/lib/demo'
import {
  checkoutUrl,
  createHandoffToken,
  isTorqvoiceComBillingConfigured,
} from '@/lib/torqvoice-com'

/**
 * Starts a purchase. The answer is a link to the checkout page on
 * torqvoice.com carrying a signed handoff; the browser goes there, then on
 * to Stripe, and comes back to the subscription page afterwards.
 */
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

    const body = await request.json()
    const plan = body.plan as string

    if (plan !== 'pro' && plan !== 'enterprise') {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'pro' or 'enterprise'" },
        { status: 400 }
      )
    }

    if (!isTorqvoiceComBillingConfigured()) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 })
    }

    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, name: true },
    })
    if (!user?.email) {
      return NextResponse.json({ error: 'Your account has no email address' }, { status: 400 })
    }

    const token = createHandoffToken({
      organizationId: ctx.organizationId,
      plan,
      email: user.email,
      name: user.name ?? '',
    })

    return NextResponse.json({ url: checkoutUrl(token) })
  } catch (error) {
    console.error('[Subscription Checkout] Error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
