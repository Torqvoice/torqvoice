import { notify } from '@/lib/notify'
import { applyWhatsappStatus, getWhatsappConfig, recordInboundWhatsapp } from '@/lib/whatsapp'

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

  const config = await getWhatsappConfig(organizationId)
  if (!config || config.adapter.id !== provider || !config.adapter.verify) {
    return new Response('Forbidden', { status: 403 })
  }

  return config.adapter.verify(request, config.context)
}

export async function POST(request: Request, { params }: RouteParams) {
  const { provider, organizationId } = await params

  const config = await getWhatsappConfig(organizationId)
  if (!config || config.adapter.id !== provider) {
    // A workshop that switched provider or turned WhatsApp off should not
    // trigger endless retries at the other end.
    return new Response(null, { status: 200 })
  }

  try {
    const events = await config.adapter.receive(request, config.context)

    for (const status of events.statuses) {
      await applyWhatsappStatus(organizationId, status)
    }

    for (const message of events.inbound) {
      const { message: stored, customer } = await recordInboundWhatsapp(
        organizationId,
        config.adapter.id,
        message
      )

      const preview =
        message.body?.slice(0, 100) || (message.media ? `[${message.media.type}]` : '')

      await notify({
        organizationId,
        type: 'whatsapp_inbound',
        title: 'New WhatsApp message',
        message: `${customer?.name ?? message.senderName ?? message.from}: ${preview}`,
        entityType: 'whatsapp_message',
        entityId: stored.id,
        entityUrl: customer ? `/whatsapp?customerId=${customer.id}` : '/whatsapp',
      })
    }
  } catch (error) {
    // A rejected signature and a malformed payload look the same from the
    // provider's side, and neither is worth retrying.
    console.error(`[webhook/whatsapp/${provider}] ${(error as Error).message}`)
  }

  return config.adapter.acknowledge()
}
