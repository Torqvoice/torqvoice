import { timingSafeEqual } from 'crypto'
import type {
  WhatsappAdapter,
  WhatsappContext,
  WhatsappInbound,
  WhatsappMediaPayload,
  WhatsappMediaType,
  WhatsappOutbound,
  WhatsappSendResult,
  WhatsappStatusEvent,
  WhatsappWebhookEvents,
} from '../types'

/**
 * WhatsApp through Twilio.
 *
 * Twilio fronts Meta, so the workshop skips most of the onboarding and pays a
 * markup instead. Worth offering because a shop already sending SMS through
 * Twilio needs nothing but an approved sender to start.
 */

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

/** Twilio addresses WhatsApp numbers with a scheme prefix. */
function channelAddress(number: string): string {
  const trimmed = number.trim()
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`
}

function stripChannel(address: string): string {
  return address.replace(/^whatsapp:/, '').trim()
}

function guessMediaType(contentType: string | undefined): WhatsappMediaType {
  if (!contentType) return 'document'
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'document'
}

/** Twilio's delivery vocabulary is wider than ours; anything else is ignored. */
function normalizeStatus(status: string | undefined): WhatsappStatusEvent['status'] | null {
  switch (status) {
    case 'sent':
    case 'accepted':
    case 'queued':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
    case 'undelivered':
      return 'failed'
    default:
      return null
  }
}

export const twilioAdapter: WhatsappAdapter = {
  id: 'twilio',
  label: 'Twilio WhatsApp',
  docsUrl: 'https://www.twilio.com/docs/whatsapp/quickstart',
  usesWebhookToken: true,

  setup: {
    credentials: 'https://console.twilio.com/',
    webhook: 'https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders',
    number: 'https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders',
    templates: 'https://console.twilio.com/us1/develop/sms/content-template-builder',
  },

  template: {
    label: 'Content SID',
    help: 'Twilio approves templates as Content resources. Copy the SID from Twilio Content Template Builder; it starts with HX. A template name will be rejected.',
    placeholder: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    usesLanguage: false,
    mediaAs: 'variable',
    validate: (value) =>
      /^HX[0-9a-fA-F]{32}$/.test(value)
        ? null
        : 'Twilio expects a Content SID starting with HX, not a template name.',
  },

  credentials: [
    {
      key: 'accountSid',
      label: 'Account SID',
      required: true,
      placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'The same SID as your Twilio SMS setup, if you already use one.',
    },
    {
      key: 'authToken',
      label: 'Auth token',
      secret: true,
      required: true,
    },
    {
      key: 'messagingServiceSid',
      label: 'Messaging service SID',
      placeholder: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'Optional. Set this to send through a messaging service instead of the number directly.',
    },
  ],

  async send(ctx, message): Promise<WhatsappSendResult> {
    const accountSid = ctx.credentials.accountSid
    const authToken = ctx.credentials.authToken
    if (!accountSid || !authToken) {
      throw new Error('Twilio is not configured. Add your Account SID and Auth Token.')
    }

    const form = buildTwilioForm(ctx, message)

    const response = await fetch(`${TWILIO_API}/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        message?: string
        code?: number
        more_info?: string
      } | null
      // "Invalid Parameter" on its own sends a workshop hunting; the code is
      // what Twilio's own documentation is indexed by.
      const detail = error?.message || `HTTP ${response.status}`
      const code = error?.code ? ` (Twilio error ${error.code})` : ''
      const more = error?.more_info ? ` See ${error.more_info}` : ''
      throw new Error(`${detail}${code}.${more}`)
    }

    const result = (await response.json()) as { sid?: string; status?: string }
    return {
      providerMessageId: result.sid,
      status: result.status === 'sent' ? 'sent' : 'queued',
    }
  },

  async receive(request, ctx): Promise<WhatsappWebhookEvents> {
    // Twilio signs with the auth token, but the signature covers the exact
    // public URL, which a proxy in front of us may rewrite. The shared token
    // in the webhook URL is what we can check reliably.
    const expected = ctx.credentials.webhookToken
    if (expected) {
      const provided = new URL(request.url).searchParams.get('token') ?? ''
      if (!constantTimeEquals(provided, expected)) {
        throw new Error('Invalid webhook token')
      }
    }

    const form = await request.formData()
    const value = (key: string) => {
      const entry = form.get(key)
      return typeof entry === 'string' ? entry : undefined
    }

    const messageSid = value('MessageSid') ?? value('SmsSid')
    const statusValue = value('MessageStatus') ?? value('SmsStatus')

    // One route carries both inbound messages and delivery receipts. A
    // delivery receipt has a status and no body.
    if (statusValue && !value('Body') && !value('NumMedia')) {
      const normalized = normalizeStatus(statusValue)
      if (!messageSid || !normalized) return { inbound: [], statuses: [] }
      return {
        inbound: [],
        statuses: [
          {
            providerMessageId: messageSid,
            status: normalized,
            errorMessage: value('ErrorMessage'),
          },
        ],
      }
    }

    const from = value('From')
    if (!from) return { inbound: [], statuses: [] }

    const mediaCount = Number(value('NumMedia') ?? '0')
    const mediaUrl = mediaCount > 0 ? value('MediaUrl0') : undefined
    const mediaContentType = mediaCount > 0 ? value('MediaContentType0') : undefined

    const inbound: WhatsappInbound = {
      providerMessageId: messageSid,
      from: stripChannel(from),
      to: stripChannel(value('To') ?? ctx.from),
      body: value('Body') || undefined,
      senderName: value('ProfileName'),
      media: mediaUrl
        ? {
            reference: mediaUrl,
            type: guessMediaType(mediaContentType),
            mimeType: mediaContentType,
          }
        : undefined,
    }

    return { inbound: [inbound], statuses: [] }
  },

  async fetchMedia(ctx, reference): Promise<WhatsappMediaPayload> {
    const accountSid = ctx.credentials.accountSid
    const authToken = ctx.credentials.authToken
    if (!accountSid || !authToken) throw new Error('Twilio credentials are missing.')

    // Twilio hands out a URL rather than an id, but it still sits behind the
    // account's basic auth.
    if (!reference.startsWith('https://api.twilio.com/')) {
      throw new Error('Refusing to fetch media from outside Twilio.')
    }

    const response = await fetch(reference, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    })
    if (!response.ok) throw new Error(`Could not download media (HTTP ${response.status})`)

    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    }
  },

  acknowledge() {
    // Twilio treats anything else as a reason to reply to the customer.
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  },
}

/** Exported for tests: the form Twilio expects for each kind of message. */
export function buildTwilioForm(ctx: WhatsappContext, message: WhatsappOutbound): URLSearchParams {
  const form = new URLSearchParams()
  form.set('To', channelAddress(message.to))

  const messagingServiceSid = ctx.credentials.messagingServiceSid
  if (messagingServiceSid) {
    form.set('MessagingServiceSid', messagingServiceSid)
  } else {
    form.set('From', channelAddress(ctx.from))
  }

  if (message.template) {
    // Twilio approves templates as Content resources, so the template name
    // doubles as the Content SID.
    form.set('ContentSid', message.template.name)
    if (message.template.variables?.length) {
      const variables: Record<string, string> = {}
      message.template.variables.forEach((text, index) => {
        variables[String(index + 1)] = text
      })
      form.set('ContentVariables', JSON.stringify(variables))
    }
    // No MediaUrl here on purpose: a Twilio media template carries its own
    // media placeholder, filled by one of the content variables above.
    return form
  }

  if (message.body) form.set('Body', message.body)
  if (message.mediaUrl) form.append('MediaUrl', message.mediaUrl)
  return form
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}
