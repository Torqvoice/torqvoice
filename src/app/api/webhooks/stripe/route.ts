import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    // Parse the raw body without trusting it — only to discover which org this
    // webhook targets, so we can load that org's Stripe credentials. Nothing
    // from this unverified payload is trusted for recording a payment.
    let unverifiedEvent: Stripe.Event
    try {
      unverifiedEvent = JSON.parse(body) as Stripe.Event
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (unverifiedEvent.type !== 'checkout.session.completed') {
      return NextResponse.json({ received: true })
    }

    const unverifiedSession = (unverifiedEvent.data as Stripe.Event.Data)
      .object as Stripe.Checkout.Session
    const routingOrgId = unverifiedSession.metadata?.orgId
    const unverifiedSessionId = unverifiedSession.id

    if (!routingOrgId || !unverifiedSessionId) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const [webhookSecretSetting, secretKeySetting] = await Promise.all([
      db.appSetting.findUnique({
        where: {
          organizationId_key: {
            organizationId: routingOrgId,
            key: SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET,
          },
        },
      }),
      db.appSetting.findUnique({
        where: {
          organizationId_key: {
            organizationId: routingOrgId,
            key: SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY,
          },
        },
      }),
    ])

    if (!secretKeySetting?.value) {
      return NextResponse.json({ error: 'Stripe not configured for this org' }, { status: 400 })
    }

    const stripe = new Stripe(secretKeySetting.value)

    // Establish an AUTHENTIC session object. Two trust paths, never the body:
    //  - webhook secret configured → verify the signature over the raw body;
    //  - no webhook secret → re-fetch the session straight from Stripe with the
    //    org's secret key. A forged session id will not resolve to a paid
    //    session in the org's own Stripe account, so forgery is closed either
    //    way while real payments keep recording.
    let session: Stripe.Checkout.Session

    if (webhookSecretSetting?.value) {
      if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
      }
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecretSetting.value)
      } catch {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
      if (event.type !== 'checkout.session.completed') {
        return NextResponse.json({ received: true })
      }
      session = event.data.object as Stripe.Checkout.Session
    } else {
      try {
        session = await stripe.checkout.sessions.retrieve(unverifiedSessionId)
      } catch {
        return NextResponse.json({ error: 'Unknown session' }, { status: 400 })
      }
    }

    // From here on `session` is authentic; read every field from it.
    const orgId = session.metadata?.orgId
    const serviceRecordId = session.metadata?.serviceRecordId

    if (!orgId || !serviceRecordId) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    // Verify the session is actually paid
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    // Idempotent: check if payment already recorded
    const existing = await db.payment.findFirst({
      where: { externalId: session.id },
    })

    if (!existing) {
      // Verify service record exists and belongs to this org
      const record = await db.serviceRecord.findUnique({
        where: { id: serviceRecordId },
        select: { id: true, organizationId: true },
      })

      if (record && record.organizationId === orgId) {
        await db.payment.create({
          data: {
            amount: (session.amount_total ?? 0) / 100,
            method: 'stripe',
            provider: 'stripe',
            externalId: session.id,
            serviceRecordId,
          },
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
