import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channelSetup, organizationForWebhookSecret } from '@/features/integrations/Lib/messaging'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { notify } from '@/lib/notify'
import { verifyTelnyxSignature, warnOnce } from '@/lib/webhook-signatures'

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const orgSecret = url.searchParams.get('org_secret')

    if (!orgSecret) {
      return NextResponse.json({ error: 'Missing org_secret' }, { status: 400 })
    }

    // The secret in the URL belongs to a connection, or to the row it lived
    // in before SMS moved into Integrations.
    const organizationId = await organizationForWebhookSecret(
      'sms',
      orgSecret,
      ORG_SMS_KEYS.SMS_WEBHOOK_SECRET
    )

    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid org_secret' }, { status: 403 })
    }

    // The exact bytes, since the signature covers them.
    const raw = await request.text()

    // The secret in the URL says which workshop this is for; the signature
    // says it was Telnyx who sent it, when the workshop has pasted the
    // account's public key.
    const setup = await channelSetup(organizationId, 'sms')
    const publicKey =
      setup?.connectorId === 'telnyx-sms' ? setup.credentials.webhookPublicKey?.trim() : undefined
    if (publicKey) {
      const valid = verifyTelnyxSignature({
        publicKeyBase64: publicKey,
        timestamp: request.headers.get('telnyx-timestamp'),
        rawBody: raw,
        signatureBase64: request.headers.get('telnyx-signature-ed25519'),
      })
      if (!valid) {
        console.warn(`[webhook/sms/telnyx] Invalid signature for organization ${organizationId}`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    } else {
      warnOnce(
        `telnyx-sms:${setup?.connectionId ?? organizationId}`,
        `[webhook/sms/telnyx] Connection ${setup?.connectionId ?? '(none)'} of organization ${organizationId} has no webhook public key; inbound SMS is accepted on the URL secret alone`
      )
    }

    // Telnyx sends JSON with a data wrapper
    const payload = JSON.parse(raw) as {
      data?: {
        event_type?: string
        payload?: {
          from?: { phone_number?: string }
          to?: { phone_number?: string }[] | string
          text?: string
          id?: string
        }
      }
    }

    const eventType = payload.data?.event_type

    // Only process inbound messages
    if (eventType !== 'message.received') {
      return NextResponse.json({ received: true })
    }

    const msgPayload = payload.data?.payload
    const from = msgPayload?.from?.phone_number || ''
    const toRaw = msgPayload?.to
    const to = Array.isArray(toRaw)
      ? toRaw[0]?.phone_number || ''
      : typeof toRaw === 'string'
        ? toRaw
        : ''
    const body = msgPayload?.text || ''
    const messageId = msgPayload?.id

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
    console.error('[webhook/sms/telnyx] Error:', error)
    return NextResponse.json({ received: true })
  }
}
