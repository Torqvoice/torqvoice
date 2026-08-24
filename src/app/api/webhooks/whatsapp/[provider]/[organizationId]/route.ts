import { notify } from '@/lib/notify'
import {
  applyWhatsappStatus,
  getWhatsappWebhookContext,
  markWhatsappWebhookSeen,
  recordInboundWhatsapp,
} from '@/lib/whatsapp'

/**
 * One webhook for every WhatsApp provider.
 *
 * The provider in the path picks the adapter, which is the only thing that
 * knows how to read the payload or prove it is genuine. Adding a provider adds
 * no route.
 */

interface RouteParams {
  params: Promise<{ provider: string; organizationId: string }>
}

/**
 * The subscription handshake. Meta will not deliver anything until this echoes
 * its challenge; providers that skip it never call here.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { provider, organizationId } = await params

  // Verification runs before a workshop has finished the setup, so this asks
  // only for the verify token, not for a setup complete enough to send with.
  const resolved = await getWhatsappWebhookContext(organizationId, provider)
  if (!resolved?.adapter.verify) {
    return new Response('Forbidden', { status: 403 })
  }

  const response = await resolved.adapter.verify(request, resolved.context)
  if (response.ok) await markWhatsappWebhookSeen(organizationId)
  return response
}

export async function POST(request: Request, { params }: RouteParams) {
  const { provider, organizationId } = await params

  const resolved = await getWhatsappWebhookContext(organizationId, provider)
  if (!resolved) {
    // A workshop that switched provider should not trigger endless retries at
    // the other end.
    return new Response(null, { status: 200 })
  }
  const { adapter, context } = resolved

  try {
    const events = await adapter.receive(request, context)
    await markWhatsappWebhookSeen(organizationId)

    for (const status of events.statuses) {
      await applyWhatsappStatus(organizationId, status)
    }

    for (const message of events.inbound) {
      const { message: stored, customer } = await recordInboundWhatsapp(
        organizationId,
        adapter.id,
        message
      )

      // The customer sees their message was read, not merely delivered.
      if (message.providerMessageId && adapter.markRead) {
        await adapter.markRead(context, message.providerMessageId)
      }

      const preview =
        message.body?.slice(0, 100) || (message.media ? `[${message.media.type}]` : '')

      await notify({
        organizationId,
        type: 'whatsapp_inbound',
        title: 'New WhatsApp message',
        message: `${customer?.name ?? message.senderName ?? message.from}: ${preview}`,
        entityType: 'whatsapp_message',
        entityId: stored.id,
        entityUrl: customer
          ? `/messages?tab=whatsapp&customerId=${customer.id}`
          : '/messages?tab=whatsapp',
      })
    }
  } catch (error) {
    // A rejected signature and a malformed payload look the same from the
    // provider's side, and neither is worth retrying.
    console.error(`[webhook/whatsapp/${provider}] ${(error as Error).message}`)
  }

  return adapter.acknowledge()
}
