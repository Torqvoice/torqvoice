'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Speech to text through the browser's own recognition, where it has one.
 *
 * Nothing is recorded and nothing is stored: the browser hands back words and
 * the words go into a field. Chrome, Edge and Safari have it; Firefox does not,
 * and `supported` is false there so the caller can leave the button out. It is
 * only known after mount, so the server and the first client render agree.
 *
 * The types are written out here because TypeScript's DOM library does not
 * carry this API, prefixed or not.
 */

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}
interface RecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResult }
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * The language to listen in. The app's locale says which language; the
 * browser's own setting, when it is the same language, also says which
 * country's version of it ("en" and an "en-GB" browser listen in en-GB).
 */
export function dictationLanguage(appLocale: string, browserLanguage?: string): string {
  const language = appLocale.split('-')[0].toLowerCase()
  if (browserLanguage?.toLowerCase().startsWith(`${language}-`)) return browserLanguage
  return appLocale
}

/** Joins what was already written and what was just said with one space, when both exist. */
export function appendDictation(existing: string, spoken: string): string {
  const said = spoken.trim()
  if (!said) return existing
  const before = existing.replace(/\s+$/, '')
  return before ? `${before} ${said}` : said
}

export type DictationError = 'not-allowed' | 'no-microphone' | 'failed'

export function useDictation({
  locale,
  onText,
  onError,
}: {
  locale: string
  /** Called with everything heard since listening started, as it is heard. */
  onText: (spoken: string) => void
  onError?: (error: DictationError) => void
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    setSupported(recognitionConstructor() !== null)
    return () => recognitionRef.current?.abort()
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionConstructor()
    if (!Ctor || recognitionRef.current) return
    const recognition = new Ctor()
    recognition.lang = dictationLanguage(locale, navigator.language)
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let spoken = ''
      for (let i = 0; i < event.results.length; i++) spoken += event.results[i][0].transcript
      onTextRef.current(spoken)
    }
    recognition.onerror = (event) => {
      // Silence is not a failure; the browser just stops listening.
      if (event.error === 'no-speech' || event.error === 'aborted') return
      onErrorRef.current?.(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'not-allowed'
          : event.error === 'audio-capture'
            ? 'no-microphone'
            : 'failed'
      )
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    setListening(true)
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      onErrorRef.current?.('failed')
    }
  }, [locale])

  return { supported, listening, start, stop }
}
