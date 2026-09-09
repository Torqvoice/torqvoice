import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channelSetup, organizationForWebhookSecret } from '@/features/integrations/Lib/messaging'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { notify } from '@/lib/notify'
import { verifyVonageJwt, warnOnce } from '@/lib/webhook-signatures'

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const orgSecret = url.searchParams.get('org_secret')

    if (!orgSecret) {
      return NextResponse.json({ error: 'Missing org_secret' }, { status: 400 })
    }

    const organizationId = await organizationForWebhookSecret(
      'sms',
      orgSecret,
      ORG_SMS_KEYS.SMS_WEBHOOK_SECRET
    )

    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid org_secret' }, { status: 403 })
    }

    // The exact bytes, since the token's payload_hash covers them.
    const raw = await request.text()

    // The secret in the URL says which workshop this is for; the bearer JWT
    // says it was Vonage who sent it, when the workshop has pasted the
    // account's signature secret.
    const setup = await channelSetup(organizationId, 'sms')
    const signatureSecret =
      setup?.connectorId === 'vonage-sms' ? setup.credentials.signatureSecret?.trim() : undefined
    if (signatureSecret) {
      const authorization = request.headers.get('authorization') ?? ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null
      const valid = verifyVonageJwt({ token, secret: signatureSecret, rawBody: raw })
      if (!valid) {
        console.warn(`[webhook/sms/vonage] Invalid signature for organization ${organizationId}`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    } else {
      warnOnce(
        `vonage-sms:${setup?.connectionId ?? organizationId}`,
        `[webhook/sms/vonage] Connection ${setup?.connectionId ?? '(none)'} of organization ${organizationId} has no signature secret; inbound SMS is accepted on the URL secret alone`
      )
    }

    // Vonage sends JSON
    const payload = JSON.parse(raw) as {
      msisdn?: string
      to?: string
      text?: string
      messageId?: string
    }

    const from = payload.msisdn || ''
    const to = payload.to || ''
    const body = payload.text || ''
    const messageId = payload.messageId

    if (!from || !body) {
      return NextResponse.json({ received: true })
    }

    const customer = await db.customer.findFirst({
      where: { organizationId, phone: from },
      select: { id: true, name: true },
    })

    const message = await db.smsMessage.create({
      data: {
        direction: 'inbound',
        fromNumber: from,
        toNumber: to,
        body,
        status: 'received',
        providerMsgId: messageId || undefined,
        organizationId,
        customerId: customer?.id,
      },
    })

    await notify({
      organizationId,
      type: 'sms_inbound',
      title: 'New SMS received',
      message: customer
        ? `${customer.name}: ${body.slice(0, 100)}`
        : `${from}: ${body.slice(0, 100)}`,
      entityType: 'sms_message',
      entityId: message.id,
      entityUrl: customer ? `/messages?customerId=${customer.id}` : '/settings/sms',
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhook/sms/vonage] Error:', error)
    return NextResponse.json({ received: true })
  }
}
