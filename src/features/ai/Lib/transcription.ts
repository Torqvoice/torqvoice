/**
 * Speech to text through the workshop's own AI connection.
 *
 * Pure rules, kept apart from the route so they can be read and tested:
 * which providers can transcribe at all, which model to ask, and what the
 * model is told to expect so that "Octavia" and "P0303" come out spelled the
 * way a workshop spells them.
 */

/** Anthropic has no transcription endpoint; the other two speak OpenAI's. */
export function canTranscribe(provider: string | null | undefined): boolean {
  return provider === 'openai' || provider === 'openai-compatible'
}

/**
 * OpenAI's current speech model where we know it exists. A compatible server
 * (a local Whisper, Groq, LocalAI) is asked for `whisper-1`, the name those
 * servers answer to by convention whatever they run underneath.
 */
export function transcriptionModel(provider: string): string {
  return provider === 'openai' ? 'gpt-4o-mini-transcribe' : 'whisper-1'
}

/** Two letters, which is what the API takes; anything else means "work it out". */
export function transcriptionLanguage(tag: string | null | undefined): string | undefined {
  const language = tag?.trim().split('-')[0].toLowerCase()
  if (!language || !/^[a-z]{2}$/.test(language)) return undefined
  // The app says Bokmål ('nb'); speech models list Norwegian as 'no'.
  return language === 'nb' ? 'no' : language
}

export interface TranscriptionSubject {
  make?: string | null
  model?: string | null
  year?: number | null
}

/**
 * A hint, not an instruction: speech models read the prompt as the text that
 * came just before, and carry its vocabulary and spelling into what follows.
 */
export function transcriptionPrompt(subject: TranscriptionSubject, spokenBefore = ''): string {
  const vehicle = [subject.year, subject.make, subject.model].filter(Boolean).join(' ')
  return [
    'A customer at a vehicle workshop describes what is wrong with their vehicle.',
    vehicle ? `The vehicle is a ${vehicle}.` : '',
    'Fault codes are written like P0303. Parts and systems: ABS, ESP, DPF, EGR, turbo, clutch, brake pads, brake discs, ignition coil, spark plugs, timing belt, wheel bearing, control arm.',
    // Last, because the model continues from where the prompt ends: a live
    // dictation is sent in stretches, and this is the end of the one before.
    spokenBefore.trim(),
  ]
    .filter(Boolean)
    .join(' ')
}

/** OpenAI refuses more than this; a few minutes of speech is well under it. */
export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024

/** OpenAI's streaming speech model, the one that writes while somebody talks. */
export const LIVE_TRANSCRIPTION_MODEL = 'gpt-live-transcribe'

/** Words worth hearing right, for the live model's keyword hints. */
export function transcriptionKeywords(subject: TranscriptionSubject): string[] {
  return [
    subject.make,
    subject.model,
    'ABS',
    'ESP',
    'DPF',
    'EGR',
    'turbo',
    'clutch',
    'brake pads',
    'brake discs',
    'ignition coil',
    'spark plugs',
    'timing belt',
    'wheel bearing',
  ].filter((word): word is string => Boolean(word?.trim()))
}

/**
 * The session a live dictation runs in: transcription only (nothing talks
 * back), and no turn detection, which this model does not have. It writes as
 * the speech arrives whatever happens, and settles a stretch of it when the
 * page commits what has been said so far. No language means the model works
 * it out.
 *
 * `extras: false` is the same session with nothing optional in it (no keyword
 * hints, no noise reduction for a microphone that is not held to the mouth),
 * for the retry when the vendor refuses one of them.
 */
export function liveTranscriptionSession(
  subject: TranscriptionSubject,
  language: string | undefined,
  extras = true
) {
  return {
    type: 'transcription',
    audio: {
      input: {
        ...(extras ? { noise_reduction: { type: 'far_field' } } : {}),
        transcription: {
          model: LIVE_TRANSCRIPTION_MODEL,
          ...(language ? { language } : {}),
          ...(extras ? { keywords: transcriptionKeywords(subject) } : {}),
        },
        turn_detection: null,
      },
    },
  }
}
