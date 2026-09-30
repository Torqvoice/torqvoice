'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Formats a browser may be able to record, best first. Safari only has the last. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

/** How often what has been said so far is sent to be written down. */
const PARTIAL_EVERY_MS = 3_000
/**
 * How long one stretch of recording runs before a new one is started. Every
 * partial sends the stretch so far, so a short stretch keeps what is sent
 * (and billed) a few times the length of the talk rather than growing with
 * its square.
 */
const SEGMENT_MS = 20_000
/** Long enough for a customer to tell the whole story. */
const MAX_RECORDING_MS = 5 * 60 * 1000

export type LiveTranscriptionError = 'not-allowed' | 'no-microphone' | 'failed'

/** Turns a clip into text. `context` is the text just before it, for continuity. */
export type TranscribeClip = (clip: Blob, context: string) => Promise<string>

/** What has been written so far, from the finished stretches and the one in progress. */
export function joinTranscript(committed: (string | undefined)[], partial: string): string {
  return [...committed, partial]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Speech written down while it is spoken, through a transcription endpoint
 * that only takes finished files.
 *
 * The microphone is recorded in stretches. Every few seconds the stretch so
 * far is sent off and the text that comes back replaces what that stretch had
 * produced before, so the words appear as the person talks and correct
 * themselves as the model hears more. When a stretch ends it is sent one last
 * time and its text is settled; the next stretch has already started on the
 * same microphone, so nothing said in between is lost.
 *
 * Answers can arrive out of order (a slow partial after a fast final), so
 * each is tagged with its stretch and its turn, and a late one is dropped.
 */
export function useLiveTranscription({
  transcribe,
  onText,
  onError,
}: {
  transcribe: TranscribeClip
  /** Everything written since recording started, each time it changes. */
  onText: (text: string) => void
  onError?: (error: LiveTranscriptionError) => void
}) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  /** True from the moment recording stops until the last stretch is written down. */
  const [finishing, setFinishing] = useState(false)

  const transcribeRef = useRef(transcribe)
  transcribeRef.current = transcribe
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const session = useRef<{
    stream: MediaStream
    mimeType: string | undefined
    recorder: MediaRecorder | null
    chunks: Blob[]
    segment: number
    committed: (string | undefined)[]
    partial: string
    /** The newest answer applied for the stretch in progress. */
    partialTurn: number
    turn: number
    inFlight: boolean
    pendingFinals: number
    stopped: boolean
    failed: boolean
    timers: ReturnType<typeof setInterval>[]
  } | null>(null)

  useEffect(() => {
    setSupported(
      typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    )
    return () => {
      const s = session.current
      if (!s) return
      for (const timer of s.timers) clearInterval(timer)
      s.stopped = true
      if (s.recorder && s.recorder.state !== 'inactive') {
        // Leaving the page: drop the clip rather than hand it to a page that is gone.
        s.recorder.ondataavailable = null
        s.recorder.onstop = null
        s.recorder.stop()
      }
      for (const track of s.stream.getTracks()) track.stop()
      session.current = null
    }
  }, [])

  const publish = () => {
    const s = session.current
    if (s) onTextRef.current(joinTranscript(s.committed, s.partial))
  }

  const fail = (error: LiveTranscriptionError) => {
    const s = session.current
    if (s?.failed) return
    if (s) s.failed = true
    onErrorRef.current?.(error)
  }

  const finishIfDone = () => {
    const s = session.current
    if (!s || !s.stopped || s.pendingFinals > 0) return
    for (const track of s.stream.getTracks()) track.stop()
    session.current = null
    setFinishing(false)
  }

  /** The text just before a stretch, so a sentence cut by the join reads on. */
  const contextBefore = (segment: number) => {
    const s = session.current
    if (!s) return ''
    return joinTranscript(s.committed.slice(0, segment), '').slice(-200)
  }

  const sendPartial = async () => {
    const s = session.current
    if (!s || s.inFlight || s.stopped || s.chunks.length === 0) return
    const segment = s.segment
    const turn = ++s.turn
    const clip = new Blob(s.chunks, { type: s.mimeType })
    s.inFlight = true
    try {
      const text = await transcribeRef.current(clip, contextBefore(segment))
      const now = session.current
      // Still the stretch in progress, and nothing newer has been applied.
      if (now && now === s && now.segment === segment && turn > now.partialTurn) {
        now.partialTurn = turn
        now.partial = text
        publish()
      }
    } catch {
      // A partial that fails is not worth stopping for; the next one, or the
      // final, carries the same words.
    } finally {
      s.inFlight = false
    }
  }

  const sendFinal = async (segment: number, chunks: Blob[], mimeType: string | undefined) => {
    const s = session.current
    if (!s) return
    s.pendingFinals++
    try {
      const text =
        chunks.length > 0
          ? await transcribeRef.current(
              new Blob(chunks, { type: mimeType }),
              contextBefore(segment)
            )
          : ''
      s.committed[segment] = text
      if (s.segment === segment) s.partial = ''
      publish()
    } catch {
      // Keep what the partials heard rather than lose the stretch.
      if (s.committed[segment] === undefined) s.committed[segment] = s.partial
      fail('failed')
    } finally {
      s.pendingFinals--
      finishIfDone()
    }
  }

  const startSegment = () => {
    const s = session.current
    if (!s) return
    const chunks: Blob[] = []
    const segment = s.segment
    const recorder = new MediaRecorder(s.stream, s.mimeType ? { mimeType: s.mimeType } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      void sendFinal(segment, chunks, recorder.mimeType || s.mimeType)
    }
    s.recorder = recorder
    s.chunks = chunks
    // A chunk a second, so a partial always has the last few words in it.
    recorder.start(1_000)
  }

  const rollSegment = () => {
    const s = session.current
    if (!s || s.stopped || !s.recorder) return
    const previous = s.recorder
    // What the partials made of the old stretch stands in until its final
    // answer arrives and replaces it.
    s.committed[s.segment] = s.partial
    s.segment++
    s.partial = ''
    s.partialTurn = s.turn
    // The new stretch starts before the old one stops: the microphone is one
    // stream, and there is no moment when nobody is listening to it.
    startSegment()
    if (previous.state !== 'inactive') previous.stop()
  }

  const stop = useCallback(() => {
    const s = session.current
    if (!s || s.stopped) return
    s.stopped = true
    for (const timer of s.timers) clearInterval(timer)
    setRecording(false)
    setFinishing(true)
    if (s.recorder && s.recorder.state !== 'inactive') s.recorder.stop()
    else finishIfDone()
  }, [])

  const start = useCallback(async () => {
    if (session.current) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      onErrorRef.current?.(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'not-allowed'
          : name === 'NotFoundError'
            ? 'no-microphone'
            : 'failed'
      )
      return
    }

    session.current = {
      stream,
      mimeType: MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)),
      recorder: null,
      chunks: [],
      segment: 0,
      committed: [],
      partial: '',
      partialTurn: 0,
      turn: 0,
      inFlight: false,
      pendingFinals: 0,
      stopped: false,
      failed: false,
      timers: [],
    }
    startSegment()
    session.current.timers = [
      setInterval(() => void sendPartial(), PARTIAL_EVERY_MS),
      setInterval(rollSegment, SEGMENT_MS),
      setInterval(stop, MAX_RECORDING_MS),
    ]
    setRecording(true)
  }, [stop]) // eslint-disable-line react-hooks/exhaustive-deps -- the helpers read everything through refs

  return { supported, recording, finishing, start, stop }
}
