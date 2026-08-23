import { createHmac, timingSafeEqual } from 'crypto'
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
 * WhatsApp Cloud API, straight from Meta.
 *
 * The workshop owns the number and pays Meta directly, with nobody in between
 * taking a cut. In exchange it has to get through Meta's business verification
 * itself, which is the slow part of adopting this.
 */

/** Pinned so a Graph release cannot change behaviour under a running shop. */
const DEFAULT_GRAPH_VERSION = 'v21.0'

function graphBase(ctx: WhatsappContext): string {
  const version = ctx.credentials.apiVersion?.trim() || DEFAULT_GRAPH_VERSION
  return `https://graph.facebook.com/${version}`
}

/** Meta wants digits only: no plus, no spaces. */
function digits(number: string): string {
  return number.replace(/\D/g, '')
}

function mediaKey(type: WhatsappMediaType): string {
  return type === 'sticker' ? 'sticker' : type
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; error_user_msg?: string; code?: number }
    }
    const text =
      payload.error?.error_user_msg || payload.error?.message || `HTTP ${response.status}`

    // 190 covers everything wrong with a token, and Meta's own wording says
    // nothing about what to do next. The two cases a workshop actually hits
    // are a token that expired and one that was pasted badly.
    if (payload.error?.code === 190) {
      return `${text}. Your access token is not valid. Paste it again from Meta, replacing the whole field, and use a permanent system user token rather than the temporary one, which lasts 24 hours. (Meta error 190)`
    }

    return payload.error?.code ? `${text} (Meta error ${payload.error.code})` : text
  } catch {
    return `HTTP ${response.status}`
  }
}

interface MetaValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
  messages?: Array<{
    id?: string
    from?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    document?: { id?: string; mime_type?: string; caption?: string; filename?: string }
    video?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
    sticker?: { id?: string; mime_type?: string }
  }>
  statuses?: Array<{
    id?: string
    status?: string
    errors?: Array<{ title?: string; message?: string }>
  }>
}

/** Meta's own words for delivery, reduced to the four we store. */
function normalizeStatus(status: string | undefined): WhatsappStatusEvent['status'] | null {
  switch (status) {
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

export const metaAdapter: WhatsappAdapter = {
  id: 'meta',
  label: 'Meta WhatsApp Cloud API',
  docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  usesWebhookToken: false,

  setup: {
    credentials: 'https://developers.facebook.com/apps',
    webhook: 'https://developers.facebook.com/apps',
    templates: 'https://business.facebook.com/wa/manage/message-templates/',
  },

  template: {
    label: 'Template name',
    help: 'The name of a template approved in WhatsApp Manager, for example vehicle_ready.',
    placeholder: 'vehicle_ready',
    usesLanguage: true,
    mediaAs: 'header',
    validate: (value) =>
      /^[a-z0-9_]+$/.test(value)
        ? null
        : 'Meta template names are lower case, digits and underscores only.',
  },

  credentials: [
    {
      key: 'phoneNumberId',
      label: 'Phone number ID',
      required: true,
      placeholder: '123456789012345',
      help: 'From WhatsApp Manager, on the number you send from. Not the phone number itself.',
    },
    {
      key: 'accessToken',
      label: 'Access token',
      secret: true,
      required: true,
      help: 'Use a permanent system user token. A temporary one expires within 24 hours.',
    },
    {
      key: 'verifyToken',
      label: 'Webhook verify token',
      required: true,
      help: 'Any phrase you choose. Paste the same one into Meta when subscribing the webhook.',
    },
    {
      key: 'appSecret',
      label: 'App secret',
      secret: true,
      help: 'Optional but recommended: lets us reject webhook calls that did not come from Meta.',
    },
    {
      key: 'apiVersion',
      label: 'Graph API version',
      placeholder: DEFAULT_GRAPH_VERSION,
      help: 'Leave empty unless Meta asks you to move to a newer version.',
    },
  ],

  async send(ctx, message): Promise<WhatsappSendResult> {
    const phoneNumberId = ctx.credentials.phoneNumberId
    const accessToken = ctx.credentials.accessToken
    if (!phoneNumberId || !accessToken) {
      throw new Error('WhatsApp is not configured. Add the phone number ID and access token.')
    }

    const payload = buildMetaPayload(message)

    const response = await fetch(`${graphBase(ctx)}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await readError(response))
    }

    const result = (await response.json()) as { messages?: Array<{ id?: string }> }
    return { providerMessageId: result.messages?.[0]?.id, status: 'sent' }
  },

  async verify(request, ctx) {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token && token === ctx.credentials.verifyToken) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  },

  async receive(request, ctx): Promise<WhatsappWebhookEvents> {
    const raw = await request.text()

    // Meta signs every delivery. Checking it is the only thing standing
    // between the webhook and anyone who learns the URL.
    const appSecret = ctx.credentials.appSecret
    if (appSecret) {
      const signature = request.headers.get('x-hub-signature-256')
      if (!isSignatureValid(raw, signature, appSecret)) {
        throw new Error('Invalid webhook signature')
      }
    }

    const payload = JSON.parse(raw) as {
      entry?: Array<{ changes?: Array<{ value?: MetaValue }> }>
    }

    const inbound: WhatsappInbound[] = []
    const statuses: WhatsappStatusEvent[] = []

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        const businessNumber = value.metadata?.display_phone_number ?? ctx.from
        const profileName = value.contacts?.[0]?.profile?.name

        for (const message of value.messages ?? []) {
          if (!message.from) continue
          inbound.push({
            providerMessageId: message.id,
            from: `+${digits(message.from)}`,
            to: `+${digits(businessNumber)}`,
            body: message.text?.body ?? captionOf(message),
            media: mediaOf(message),
            sentAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined,
            senderName: profileName,
          })
        }

        for (const status of value.statuses ?? []) {
          const normalized = normalizeStatus(status.status)
          if (!status.id || !normalized) continue
          const failure = status.errors?.[0]
          statuses.push({
            providerMessageId: status.id,
            status: normalized,
            errorMessage: failure ? (failure.message ?? failure.title) : undefined,
          })
        }
      }
    }

    return { inbound, statuses }
  },

  async registerNumber(ctx, pin) {
    const phoneNumberId = ctx.credentials.phoneNumberId
    const accessToken = ctx.credentials.accessToken
    if (!phoneNumberId || !accessToken) {
      throw new Error('Add the phone number ID and access token before registering.')
    }

    const response = await fetch(`${graphBase(ctx)}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })

    if (!response.ok) throw new Error(await readError(response))
  },

  async markRead(ctx, providerMessageId) {
    const phoneNumberId = ctx.credentials.phoneNumberId
    const accessToken = ctx.credentials.accessToken
    if (!phoneNumberId || !accessToken) return

    // Best effort: a failed read receipt is not worth failing a delivery over.
    try {
      await fetch(`${graphBase(ctx)}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: providerMessageId,
        }),
      })
    } catch (error) {
      console.error('[whatsapp/meta] could not mark as read:', error)
    }
  },

  async fetchMedia(ctx, reference): Promise<WhatsappMediaPayload> {
    const accessToken = ctx.credentials.accessToken
    if (!accessToken) throw new Error('WhatsApp access token is missing.')

    // Media arrives as an id; the download URL it resolves to is short lived,
    // so it has to be fetched at the moment someone opens the attachment.
    const lookup = await fetch(`${graphBase(ctx)}/${reference}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!lookup.ok) throw new Error(await readError(lookup))

    const meta = (await lookup.json()) as { url?: string; mime_type?: string }
    if (!meta.url) throw new Error('WhatsApp did not return a media URL.')

    const download = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!download.ok) throw new Error(`Could not download media (HTTP ${download.status})`)

    return {
      body: await download.arrayBuffer(),
      contentType:
        meta.mime_type || download.headers.get('content-type') || 'application/octet-stream',
    }
  },

  acknowledge() {
    return new Response(null, { status: 200 })
  },
}

/** Exported for tests: the JSON Meta expects for each kind of message. */
export function buildMetaPayload(message: WhatsappOutbound): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', to: digits(message.to) }

  if (message.template) {
    const { name, language, variables, headerMediaUrl, headerMediaType } = message.template
    const components: Array<Record<string, unknown>> = []

    if (headerMediaUrl) {
      const type = headerMediaType ?? 'image'
      components.push({
        type: 'header',
        parameters: [{ type: mediaKey(type), [mediaKey(type)]: { link: headerMediaUrl } }],
      })
    }
    if (variables?.length) {
      components.push({
        type: 'body',
        parameters: variables.map((text) => ({ type: 'text', text })),
      })
    }

    return {
      ...base,
      type: 'template',
      template: {
        name,
        language: { code: language },
        ...(components.length ? { components } : {}),
      },
    }
  }

  if (message.mediaUrl) {
    const type = message.mediaType ?? 'image'
    const media: Record<string, unknown> = { link: message.mediaUrl }
    if (message.body) media.caption = message.body
    if (type === 'document' && message.mediaFilename) media.filename = message.mediaFilename
    return { ...base, type: mediaKey(type), [mediaKey(type)]: media }
  }

  return { ...base, type: 'text', text: { preview_url: true, body: message.body ?? '' } }
}

function captionOf(message: NonNullable<MetaValue['messages']>[number]): string | undefined {
  return message.image?.caption ?? message.document?.caption ?? message.video?.caption
}

function mediaOf(
  message: NonNullable<MetaValue['messages']>[number]
): WhatsappInbound['media'] | undefined {
  const kinds: Array<[WhatsappMediaType, { id?: string; mime_type?: string; filename?: string }?]> =
    [
      ['image', message.image],
      ['document', message.document],
      ['video', message.video],
      ['audio', message.audio],
      ['sticker', message.sticker],
    ]

  for (const [type, value] of kinds) {
    if (value?.id) {
      return {
        reference: value.id,
        type,
        mimeType: value.mime_type,
        filename: value.filename,
      }
    }
  }
  return undefined
}

function isSignatureValid(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(raw).digest('hex')
  const received = header.slice('sha256='.length)
  if (received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'))
}
