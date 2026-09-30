import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { OPENAI_BASE } from '@/integrations/ai/models'
import { dictationAccess } from '@/features/ai/Lib/dictationAccess'
import { liveTranscriptionSession, transcriptionLanguage } from '@/features/ai/Lib/transcription'
import { speechSetup } from '@/features/integrations/Lib/speech'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

function json(status: number, error: string, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status })
}

/** An SDP offer is a few kilobytes; anything much larger is not one. */
const MAX_SDP_BYTES = 64 * 1024

/**
 * Opens a live dictation: the browser's WebRTC offer in, OpenAI's answer out.
 *
 * The browser never sees the workshop's key, nor the short-lived secret made
 * from it. It sends its offer here; this opens a transcription session with
 * OpenAI under the workshop's own key (which language, which words to listen
 * for) and presents the offer to it.
 * The answer goes back, and from then on the audio travels from the browser
 * to OpenAI directly and the words come back the same way. Nothing passes
 * through this server after the handshake, and nothing is stored.
 *
 * Only OpenAI has this. A speech connection pointed at a server of the
 * workshop's own is answered with `live-unavailable`, and the page dictates
 * through the ordinary route instead.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (limited) return limited

  const access = await dictationAccess()
  if (!access.ok) return access.response
  const { organizationId, userId } = access

  const offer = await request.text()
  if (!offer.startsWith('v=0') || offer.length > MAX_SDP_BYTES) {
    return json(400, 'Expected a WebRTC offer.')
  }

  let setup: Awaited<ReturnType<typeof speechSetup>>
  try {
    setup = await speechSetup(organizationId)
  } catch {
    setup = null
  }
  if (!setup || setup.provider !== 'openai') {
    return json(409, 'Live dictation needs an OpenAI speech connection.', 'live-unavailable')
  }

  const params = request.nextUrl.searchParams
  const language = transcriptionLanguage(params.get('language'))
  const serviceRecordId = params.get('serviceRecordId')
  const record = serviceRecordId
    ? await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: { vehicle: { select: { make: true, model: true, year: true } } },
      })
    : null

  const headers = {
    Authorization: `Bearer ${setup.apiKey}`,
    // OpenAI asks for a stable, anonymous id per end user, for abuse handling.
    'OpenAI-Safety-Identifier': createHash('sha256').update(userId).digest('hex').slice(0, 32),
  }

  /**
   * Two steps, both from here. First a short-lived client secret is minted
   * for a transcription session: that is the call OpenAI documents as taking
   * `type: "transcription"`, with the model, language and keyword hints. Then
   * the browser's offer is presented under that secret, and the answer comes
   * back. Presenting the offer and the session together in one call is
   * documented for voice sessions only, and was refused for this one.
   */
  const mintSecret = (hints: boolean) =>
    fetch(`${OPENAI_BASE}/realtime/client_secrets`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: liveTranscriptionSession(record?.vehicle ?? {}, language, hints),
      }),
    })

  /** What OpenAI said was wrong, in its own words, for the person who owns the key. */
  const refusal = async (res: Response, step: string) => {
    const detail = await res.text().catch(() => '')
    console.error(
      `[dictation] OpenAI refused the live session (${step})`,
      res.status,
      detail.slice(0, 800)
    )
    let message = ''
    try {
      message = JSON.parse(detail)?.error?.message ?? ''
    } catch {
      // Not JSON; the status is all there is.
    }
    if (res.status === 401 || res.status === 403) {
      return json(502, 'OpenAI rejected the speech connection’s key.', 'live-refused')
    }
    return json(
      502,
      message ? `OpenAI: ${message}` : `OpenAI answered HTTP ${res.status}.`,
      'live-refused'
    )
  }

  try {
    let minted = await mintSecret(true)
    // The hints are a nicety. If the vendor refuses the session over one of
    // them, the dictation is worth more than the hint: ask again without.
    if (minted.status === 400) minted = await mintSecret(false)
    if (!minted.ok) return refusal(minted, 'client secret')
    const secret = (await minted.json())?.value
    if (typeof secret !== 'string' || !secret) {
      return json(502, 'OpenAI returned no client secret.', 'live-refused')
    }

    const answer = await fetch(`${OPENAI_BASE}/realtime/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
      body: offer,
    })
    if (!answer.ok) return refusal(answer, 'call')

    return new NextResponse(await answer.text(), {
      status: 200,
      headers: { 'Content-Type': 'application/sdp' },
    })
  } catch {
    return json(502, 'Could not reach OpenAI.', 'live-refused')
  }
}
