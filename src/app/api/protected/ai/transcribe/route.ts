import { type NextRequest, NextResponse } from 'next/server'
import { toFile } from 'openai'
import { db } from '@/lib/db'
import { dictationAccess } from '@/features/ai/Lib/dictationAccess'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/ai'
import { speechSetup } from '@/features/integrations/Lib/speech'
import { describeAiError } from '@/lib/ai-error'
import {
  MAX_TRANSCRIPTION_BYTES,
  transcriptionLanguage,
  transcriptionPrompt,
} from '@/features/ai/Lib/transcription'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/**
 * What somebody said at the desk, as text.
 *
 * The clip is held in memory for the length of this request, sent to the AI
 * vendor the workshop connected, and gone when the answer comes back. Nothing
 * is written to disk or to the database: what is kept is the text, and only
 * once the person at the desk saves the job it was dictated into.
 */
export async function POST(request: NextRequest) {
  // Live dictation asks every few seconds while somebody is talking, so the
  // budget is a talking person's, not a button's.
  const limited = rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (limited) return limited

  const access = await dictationAccess()
  if (!access.ok) return access.response
  const { organizationId } = access

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, 'Expected a recording.')
  }
  const audio = form.get('audio')
  if (!(audio instanceof File) || audio.size === 0) return json(400, 'Expected a recording.')
  if (audio.size > MAX_TRANSCRIPTION_BYTES) return json(413, 'The recording is too long.')
  if (!audio.type.startsWith('audio/') && !audio.type.startsWith('video/')) {
    return json(415, 'Not an audio recording.')
  }

  // The speech-to-text connection, or the chat provider when it has a speech
  // model of its own. Neither, and there is nowhere to send this.
  let setup: Awaited<ReturnType<typeof speechSetup>>
  try {
    setup = await speechSetup(organizationId)
  } catch {
    setup = null
  }
  if (!setup) {
    return json(
      409,
      'No speech model is connected. Connect Speech to text in Settings → Integrations.'
    )
  }

  // The vehicle, for the vocabulary hint. Looked up by id and organization:
  // a job that is not this workshop's simply contributes nothing.
  const serviceRecordId = form.get('serviceRecordId')
  const record =
    typeof serviceRecordId === 'string' && serviceRecordId
      ? await db.serviceRecord.findFirst({
          where: { id: serviceRecordId, organizationId },
          select: { vehicle: { select: { make: true, model: true, year: true } } },
        })
      : null

  const language = transcriptionLanguage(form.get('language') as string | null)
  // What was said just before this stretch, so a sentence cut at the join
  // between two stretches is continued rather than started again.
  const rawContext = form.get('context')
  const context = typeof rawContext === 'string' ? rawContext.slice(-200) : ''

  try {
    const client = createClient({ ...setup, model: setup.model })
    const result = await client.audio.transcriptions.create({
      file: await toFile(audio, audio.name || 'dictation.webm', { type: audio.type }),
      model: setup.model,
      prompt: transcriptionPrompt(record?.vehicle ?? {}, context),
      ...(language ? { language } : {}),
    })
    return NextResponse.json({ text: result.text.trim() })
  } catch (err) {
    return json(502, describeAiError(err))
  }
}
