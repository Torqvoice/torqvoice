import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { getWhatsappConfig } from '@/lib/whatsapp'

/**
 * Streams a photo or document a customer sent over WhatsApp.
 *
 * Providers keep inbound media behind their own credentials and hand out
 * short-lived URLs, so the conversation view cannot link to it directly. This
 * fetches it with the workshop's own credentials, for the workshop's own staff.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { messageId } = await params

  const message = await db.whatsappMessage.findFirst({
    where: { id: messageId, organizationId: ctx.organizationId },
    select: { mediaUrl: true, mediaType: true, mediaFilename: true, provider: true },
  })
  if (!message?.mediaUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const config = await getWhatsappConfig(ctx.organizationId)
  // Media only resolves through the provider that received it, so a workshop
  // that has since switched provider keeps the message but loses the file.
  if (!config?.adapter.fetchMedia || config.adapter.id !== message.provider) {
    return NextResponse.json({ error: 'Media is no longer available' }, { status: 410 })
  }

  try {
    const media = await config.adapter.fetchMedia(config.context, message.mediaUrl)
    return new Response(media.body, {
      headers: {
        'Content-Type': media.contentType,
        'Cache-Control': 'private, max-age=3600',
        ...(message.mediaFilename
          ? { 'Content-Disposition': `inline; filename="${message.mediaFilename}"` }
          : {}),
      },
    })
  } catch (error) {
    console.error('[whatsapp/media]', error)
    return NextResponse.json({ error: 'Could not load media' }, { status: 502 })
  }
}
