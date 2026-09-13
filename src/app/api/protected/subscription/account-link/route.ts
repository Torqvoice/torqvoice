import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { isDemoMode } from '@/lib/demo'
import {
  accountLinkUrl,
  createAccountLinkToken,
  isTorqvoiceComBillingConfigured,
} from '@/lib/torqvoice-com'

/**
 * A link that signs the current person into their account on torqvoice.com,
 * where the invoices are. What they see there is looked up by their email.
 */
export async function POST() {
  try {
    if (isDemoMode) {
      return NextResponse.json({ error: 'This action is disabled on the demo.' }, { status: 403 })
    }
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Owners and admins, like every other billing route: they are the ones
    // who bought, and the only ones the subscription page is shown to.
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isTorqvoiceComBillingConfigured()) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 })
    }

    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, name: true, emailVerified: true },
    })
    if (!user?.email) {
      return NextResponse.json({ error: 'Your account has no email address' }, { status: 400 })
    }

    const token = createAccountLinkToken({
      userId: ctx.userId,
      email: user.email,
      name: user.name ?? '',
      emailVerified: user.emailVerified,
    })
    return NextResponse.json({ url: accountLinkUrl(token) })
  } catch (error) {
    console.error('[Subscription Account Link] Error:', error)
    return NextResponse.json({ error: 'Could not open the account' }, { status: 500 })
  }
}
