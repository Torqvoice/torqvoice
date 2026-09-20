'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { joinTranscript, type LiveTranscriptionError } from './use-live-transcription'

/** Long enough for a customer to tell the whole story; it is billed by the minute. */
const MAX_SESSION_MS = 5 * 60 * 1000
/** How long to wait, after stopping, for the words still on their way. */
const SETTLE_MS = 2_500
/**
 * This model has no turn detection: it writes as it hears, and settles what it
 * has heard when told to. Told every so often, so a long story is settled as
 * it goes and the audio held for it never grows past a few seconds' worth.
 */
const COMMIT_EVERY_MS = 20_000

export type RealtimeError = LiveTranscriptionError | 'unavailable' | 'refused'

/**
 * The words heard so far, utterance by utterance.
 *
 * The model writes each utterance as a stream of fragments and then sends the
 * utterance whole, corrected. Utterances are kept in the order they were first
 * heard, fragments are added to their own utterance, and the whole version
 * replaces them when it arrives.
 */
/** The stretch being spoken now, before the model has named it. */
const PENDING = ''

export class RealtimeTranscript {
  private order: string[] = []
  private text = new Map<string, string>()

  private slot(itemId: string) {
    if (this.text.has(itemId)) return
    // Words can arrive before the stretch they belong to has been given its
    // id. They are kept under no id, and the first id to turn up takes them
    // over, so the same words are not written once loose and once settled.
    const loose = this.text.get(PENDING)
    if (itemId !== PENDING && loose !== undefined) {
      this.order[this.order.indexOf(PENDING)] = itemId
      this.text.delete(PENDING)
      this.text.set(itemId, loose)
      return
    }
    this.order.push(itemId)
    this.text.set(itemId, '')
  }

  addDelta(itemId: string, delta: string) {
    this.slot(itemId)
    this.text.set(itemId, (this.text.get(itemId) ?? '') + delta)
  }

  complete(itemId: string, transcript: string) {
    this.slot(itemId)
    this.text.set(itemId, transcript)
  }

  toString() {
    return joinTranscript(
      this.order.map((id) => this.text.get(id)),
      ''
    )
  }
}

/**
 * Speech written down word by word, over a live connection to the speech
 * model. The browser opens a WebRTC connection; the offer goes to `connectUrl`
 * on our own server, which forwards it under the workshop's key and hands back
 * the answer, so the key never comes here. After that the microphone goes
 * straight to the model and the words come straight back.
 *
 * `unavailable` means this install cannot do it (no OpenAI speech connection,
 * or the vendor said no): the caller should dictate some other way, and need
 * not tell anybody. `refused` means the vendor said no to a connection that
 * should have worked, with its reason: worth showing, since a wrong key or an
 * account without access looks the same as a bug otherwise.
 */
export function useRealtimeTranscription({
  connectUrl,
  onText,
  onError,
}: {
  /** Where to send the offer; called at start, so it can carry the language chosen then. */
  connectUrl: () => string
  onText: (text: string) => void
  onError?: (error: RealtimeError, message?: string) => void
}) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const connectUrlRef = useRef(connectUrl)
  connectUrlRef.current = connectUrl
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const session = useRef<{
    pc: RTCPeerConnection
    stream: MediaStream
    channel: RTCDataChannel
    timers: ReturnType<typeof setTimeout>[]
    /** Utterances heard but not yet sent back whole. */
    open: Set<string>
    closing: boolean
  } | null>(null)

  const close = useCallback(() => {
    const s = session.current
    if (!s) return
    session.current = null
    for (const timer of s.timers) clearTimeout(timer)
    for (const track of s.stream.getTracks()) track.stop()
    try {
      s.channel.close()
      s.pc.close()
    } catch {
      // Already gone.
    }
    setRecording(false)
    setFinishing(false)
  }, [])

  useEffect(() => {
    setSupported(
      typeof RTCPeerConnection !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    )
    return close
  }, [close])

  const stop = useCallback(() => {
    const s = session.current
    if (!s || s.closing) return
    s.closing = true
    setRecording(false)
    // The microphone goes quiet at once; what was already said is still being
    // written down, so the connection stays a moment longer to hear it back.
    for (const track of s.stream.getTracks()) track.enabled = false
    if (s.channel.readyState === 'open') {
      try {
        s.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      } catch {
        // Nothing buffered is not an error worth stopping for.
      }
    }
    setFinishing(true)
    s.timers.push(setTimeout(close, SETTLE_MS))
  }, [close])

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

    const pc = new RTCPeerConnection()
    for (const track of stream.getTracks()) pc.addTrack(track, stream)
    const channel = pc.createDataChannel('oai-events')
    const transcript = new RealtimeTranscript()
    const current = {
      pc,
      stream,
      channel,
      timers: [] as ReturnType<typeof setTimeout>[],
      open: new Set<string>(),
      closing: false,
    }
    session.current = current

    channel.addEventListener('message', (message) => {
      let event: { type?: string; item_id?: string; delta?: string; transcript?: string }
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      const itemId = event.item_id ?? ''
      if (event.type === 'conversation.item.input_audio_transcription.delta') {
        current.open.add(itemId)
        transcript.addDelta(itemId, event.delta ?? '')
      } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
        current.open.delete(itemId)
        current.open.delete('')
        transcript.complete(itemId, event.transcript ?? '')
      } else {
        return
      }
      onTextRef.current(transcript.toString())
      // Stopped, and the last utterance has come back whole: nothing to wait for.
      if (current.closing && current.open.size === 0) close()
    })

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' && session.current === current) {
        close()
        onErrorRef.current?.('failed')
      }
    })

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const res = await fetch(connectUrlRef.current(), {
        method: 'POST',
        body: offer.sdp,
        headers: { 'Content-Type': 'application/sdp' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        close()
        onErrorRef.current?.(
          data?.code === 'live-unavailable'
            ? 'unavailable'
            : data?.code === 'live-refused'
              ? 'refused'
              : 'failed',
          typeof data?.error === 'string' ? data.error : undefined
        )
        return
      }
      // Stopped while the handshake was still out.
      if (session.current !== current) return
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
      current.timers.push(setTimeout(stop, MAX_SESSION_MS))
      const committer = setInterval(() => {
        if (current.closing || channel.readyState !== 'open') return
        try {
          channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        } catch {
          // Nothing said since the last one; not worth stopping for.
        }
      }, COMMIT_EVERY_MS)
      current.timers.push(committer as unknown as ReturnType<typeof setTimeout>)
      setRecording(true)
    } catch {
      close()
      onErrorRef.current?.('failed')
    }
  }, [close, stop])

  return { supported, recording, finishing, start, stop }
}
