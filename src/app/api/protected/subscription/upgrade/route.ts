import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { billingErrorResponse, billingRequest } from '@/lib/torqvoice-com'

/**
 * Pro to Enterprise, charged today. torqvoice.com changes the Stripe
 * subscription and writes the new plan to this organization's row before
 * answering, so the page can simply refresh.
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
    // A proration timestamp from the preview a moment ago, or nothing.
    const rawProration = body.prorationDate
    const nowSeconds = Math.floor(Date.now() / 1000)
    const prorationDate =
      typeof rawProration === 'number' &&
      Number.isInteger(rawProration) &&
      rawProration <= nowSeconds &&
      rawProration >= nowSeconds - 60 * 60
        ? rawProration
        : undefined

    if (plan !== 'enterprise') {
      return NextResponse.json({ error: 'Can only upgrade to enterprise' }, { status: 400 })
    }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    })

    if (!subscription?.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 })
    }

    await billingRequest<{ success: boolean }>('upgrade', {
      organizationId: ctx.organizationId,
      plan,
      ...(prorationDate ? { prorationDate } : {}),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return billingErrorResponse(error, 'Upgrade failed')
  }
}
