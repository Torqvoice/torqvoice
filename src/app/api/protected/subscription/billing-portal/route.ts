import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { isDemoMode } from '@/lib/demo'
import { billingErrorResponse, billingRequest } from '@/lib/torqvoice-com'

/** The Stripe billing portal, opened through torqvoice.com, returning here. */
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

    const subscription = await db.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { stripeCustomerId: true },
    })

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
    }

    const { url } = await billingRequest<{ url: string }>('portal', {
      organizationId: ctx.organizationId,
    })

    return NextResponse.json({ url })
  } catch (error) {
    return billingErrorResponse(error, 'Failed to create billing portal session')
  }
}
