import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channelSetup, organizationForWebhookSecret } from '@/features/integrations/Lib/messaging'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { notify } from '@/lib/notify'
import { publicRequestUrl, verifyTwilioSignature, warnOnce } from '@/lib/webhook-signatures'

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
    const formData = new URLSearchParams(raw)

    // The secret in the URL says which workshop this is for; the signature
    // says it was Twilio who sent it. Twilio signs with the same auth token
    // the workshop pasted for sending.
    const setup = await channelSetup(organizationId, 'sms')
    const authToken =
      setup?.connectorId === 'twilio-sms' ? setup.credentials.authToken?.trim() : undefined
    if (authToken) {
      const valid = verifyTwilioSignature({
        authToken,
        url: publicRequestUrl(request.url),
        params: formData,
        signature: request.headers.get('x-twilio-signature'),
      })
      if (!valid) {
        console.warn(`[webhook/sms/twilio] Invalid signature for organization ${organizationId}`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    } else {
      warnOnce(
        `twilio-sms:${setup?.connectionId ?? organizationId}`,
        `[webhook/sms/twilio] Connection ${setup?.connectionId ?? '(none)'} of organization ${organizationId} has no Twilio auth token; inbound SMS is accepted on the URL secret alone`
      )
    }

    const from = formData.get('From') ?? ''
    const to = formData.get('To') ?? ''
    const body = formData.get('Body') ?? ''
    const messageSid = formData.get('MessageSid') ?? ''

    if (!from || !body) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Match incoming phone number to a customer
    const customer = await db.customer.findFirst({
      where: { organizationId, phone: from },
      select: { id: true, name: true },
    })

    // Create inbound SMS record
    const message = await db.smsMessage.create({
      data: {
        direction: 'inbound',
        fromNumber: from,
        toNumber: to || '',
        body,
        status: 'received',
        providerMsgId: messageSid || undefined,
        organizationId,
        customerId: customer?.id,
      },
    })

    // Send in-app notification
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

    // Return TwiML empty response
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[webhook/sms/twilio] Error:', error)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
