'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Mic } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { appendDictation, useDictation } from '@/hooks/use-dictation'
import { useLiveTranscription } from '@/hooks/use-live-transcription'
import { useRealtimeTranscription } from '@/hooks/use-realtime-transcription'
import { localeNames, locales } from '@/i18n/config'
import { cn } from '@/lib/utils'

const LANGUAGE_KEY = 'torqvoice:dictationLanguage'
const ENGINE_KEY = 'torqvoice:dictationEngine'
/** Said on the window when one microphone starts, so any other one stops. */
const STARTED_EVENT = 'torqvoice:dictation-started'
/** Let the speech model work out the language. Only it can; a browser has to be told. */
const AUTO = 'auto'

const EXTENSIONS: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm' }

/**
 * The desk's microphone for the Condition step: the customer tells their
 * story and it is written down. It writes after whatever is already in the
 * box, so it can be started, stopped and started again, and what was typed by
 * hand stays.
 *
 * There are two ways to turn the speech into words, and the button picks the
 * better one it has. When the workshop has a speech model connected, the
 * words are written as they are spoken: over a live connection to the model
 * where the connection is OpenAI's, and otherwise by sending what has been
 * said every few seconds. Far more accurate than a browser, any language, and
 * primed with the vehicle and the trade's words. The audio is not kept. Otherwise the
 * browser's own recognition is used, which writes word by word but has to be
 * told the language and is weaker in the small ones. If the vendor fails, the rest of the session falls back to the
 * browser rather than leaving a button that does nothing.
 *
 * Where the workshop allows it, the menu beside the button also offers the
 * choice between the two, remembered on this browser like the language.
 *
 * The language beside the button is remembered on this browser. It starts as
 * "auto" where that is possible and as the app's language where it is not.
 */
export function DictateButton({
  value,
  onChange,
  serverTranscription = false,
  allowBrowserChoice = true,
  serviceRecordId,
}: {
  value: string
  onChange: (next: string) => void
  serverTranscription?: boolean
  /**
   * Whether a person may pick the browser's dictation over the speech model.
   * The workshop decides, on the Speech to text connection; when it says
   * "always the speech model", the choice is not drawn.
   */
  allowBrowserChoice?: boolean
  serviceRecordId?: string
}) {
  const t = useTranslations('service.concerns.dictate')
  const appLocale = useLocale()
  // What the box held when listening began; each result is written after it.
  const baseRef = useRef('')

  const [serverFailed, setServerFailed] = useState(false)
  const lastServerError = useRef<string | null>(null)
  const [liveUnavailable, setLiveUnavailable] = useState(false)
  const [language, setLanguage] = useState<string | null>(null)
  const [prefersBrowser, setPrefersBrowser] = useState(false)

  useEffect(() => {
    try {
      setLanguage(localStorage.getItem(LANGUAGE_KEY))
      setPrefersBrowser(localStorage.getItem(ENGINE_KEY) === 'browser')
    } catch {
      // Private mode: the choice lasts as long as the page does.
    }
  }, [])

  const fail = (error: 'not-allowed' | 'no-microphone' | 'failed') =>
    toast.error(
      error === 'not-allowed'
        ? t('notAllowed')
        : error === 'no-microphone'
          ? t('noMicrophone')
          : t('failed')
    )

  const browser = useDictation({
    locale: language && language !== AUTO ? language : appLocale,
    onText: (spoken) => onChange(appendDictation(baseRef.current, spoken)),
    onError: fail,
  })

  // One stretch of speech to the server, text back. A refusal (no speech
  // model, not allowed) is thrown, and tells the button to change engine.
  const transcribe = async (clip: Blob, context: string) => {
    const type = clip.type.split(';')[0]
    const body = new FormData()
    body.append('audio', new File([clip], `dictation.${EXTENSIONS[type] ?? 'webm'}`, { type }))
    if (language && language !== AUTO) body.append('language', language)
    if (serviceRecordId) body.append('serviceRecordId', serviceRecordId)
    if (context) body.append('context', context)
    const res = await fetch('/api/protected/ai/transcribe', { method: 'POST', body })
    const data = await res.json().catch(() => null)
    if (!res.ok || typeof data?.text !== 'string') {
      lastServerError.current = typeof data?.error === 'string' ? data.error : null
      throw new Error('transcription failed')
    }
    return data.text as string
  }

  const recorder = useLiveTranscription({
    transcribe,
    // Written after what the box held when recording began, and rewritten as
    // the model hears more, the same way the browser's dictation behaves.
    onText: (spoken) => onChange(appendDictation(baseRef.current, spoken)),
    onError: (error) => {
      if (error !== 'failed') {
        fail(error)
        return
      }
      // The vendor cannot, or will not. The browser can still try, so the
      // button changes engine for the rest of this visit and says why.
      setServerFailed(true)
      toast.error(lastServerError.current || t('failed'), {
        description: browser.supported ? t('fellBack') : undefined,
      })
    },
  })

  // Word by word over a live connection, where the workshop's speech
  // connection is OpenAI's. When it is not, the server says so once and the
  // stretch-by-stretch recorder above takes over without a word to anybody.
  const live = useRealtimeTranscription({
    connectUrl: () => {
      const params = new URLSearchParams()
      if (language && language !== AUTO) params.set('language', language)
      if (serviceRecordId) params.set('serviceRecordId', serviceRecordId)
      return `/api/protected/ai/transcribe/live?${params}`
    },
    onText: (spoken) => onChange(appendDictation(baseRef.current, spoken)),
    onError: (error, message) => {
      if (error === 'unavailable' || error === 'refused') {
        setLiveUnavailable(true)
        // OpenAI said no to a connection that should have worked. Say why,
        // once: otherwise the text just arrives in steps and nobody knows
        // the live connection was ever tried.
        if (error === 'refused') {
          toast.error(message || t('failed'), { description: t('liveFellBack') })
        }
        // The button was pressed to dictate; carry on with the other way.
        void recorder.start()
        return
      }
      if (error !== 'failed') {
        fail(error)
        return
      }
      toast.error(message || t('failed'))
    },
  })
  // Hooks first, before the early return below: a hook after a return is a
  // hook that some renders call and others do not, which React refuses.
  // Every step of every concern has a microphone, and there is one customer
  // talking: starting one stops whichever other was listening, so what is
  // said is written in one box and not two.
  const buttonId = useId()
  const stopRef = useRef<() => void>(undefined)
  stopRef.current = () => {
    if (live.recording) live.stop()
    if (recorder.recording) recorder.stop()
    if (browser.listening) browser.stop()
  }
  useEffect(() => {
    const onStarted = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== buttonId) stopRef.current?.()
    }
    window.addEventListener(STARTED_EVENT, onStarted)
    return () => window.removeEventListener(STARTED_EVENT, onStarted)
  }, [buttonId])

  const useLive = live.supported && !liveUnavailable

  const serverAvailable =
    serverTranscription && !serverFailed && (recorder.supported || live.supported)
  // Offered only where there are really two engines to choose between.
  const canChooseEngine = serverAvailable && allowBrowserChoice && browser.supported
  const useServer = serverAvailable && !(canChooseEngine && prefersBrowser)
  if (!useServer && !browser.supported) return null

  const serverRecording = live.recording || recorder.recording
  const active = useServer ? serverRecording : browser.listening
  const selected = language ?? (useServer ? AUTO : appLocale)
  // A browser cannot guess the language, so "auto" is not offered to it.
  const shown = !useServer && selected === AUTO ? appLocale : selected

  // The last few words are still being written down after the button is released.
  const transcribing = recorder.finishing || live.finishing

  const toggle = () => {
    if (transcribing) return
    if (!active) window.dispatchEvent(new CustomEvent(STARTED_EVENT, { detail: buttonId }))
    if (useServer) {
      if (live.recording) {
        live.stop()
      } else if (recorder.recording) {
        recorder.stop()
      } else {
        baseRef.current = value
        void (useLive ? live.start() : recorder.start())
      }
      return
    }
    if (browser.listening) {
      browser.stop()
    } else {
      baseRef.current = value
      browser.start()
    }
  }

  const chooseLanguage = (next: string) => {
    setLanguage(next)
    try {
      localStorage.setItem(LANGUAGE_KEY, next)
    } catch {
      // Private mode: it still applies until the page is left.
    }
  }

  const chooseEngine = (next: string) => {
    setPrefersBrowser(next === 'browser')
    try {
      localStorage.setItem(ENGINE_KEY, next)
    } catch {
      // Private mode: it still applies until the page is left.
    }
  }

  const status = transcribing
    ? t('transcribing')
    : active
      ? t('stopHint')
      : useServer
        ? t('startHintServer')
        : t('startHint')

  return (
    // Every state is the same size. The column this sits in is narrow, and a
    // button that grew a word when pressed pushed the row about; so the state
    // is said by the icon and its colour, and in words only to a screen reader
    // and the tooltip.
    <span className="flex h-5 shrink-0 items-center gap-0.5 normal-case tracking-normal">
      <button
        type="button"
        data-testid="dictate-condition"
        aria-pressed={active}
        aria-label={active ? t('stopHint') : t('start')}
        disabled={transcribing}
        title={status}
        onClick={toggle}
        className={cn(
          'flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-default',
          active
            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {transcribing ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : active ? (
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-sm bg-red-500" />
          </span>
        ) : (
          <Mic className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {transcribing ? t('transcribing') : active ? t('listening') : ''}
      </span>

      {/* The app's own menu, not the system's select: a native one draws its
          list in the system's colours and came out white on white in the dark
          theme. The trigger shows the code, the list the language's own name. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="dictate-language"
            aria-label={t('language')}
            title={t('language')}
            disabled={active || transcribing}
            className="flex h-5 w-9 cursor-pointer items-center justify-center rounded text-[10px] font-semibold uppercase tabular-nums text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
          >
            {shown === AUTO ? t('auto') : shown.split('-')[0]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 min-w-44 overflow-y-auto">
          {canChooseEngine && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('engine')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={useServer ? 'ai' : 'browser'}
                onValueChange={chooseEngine}
              >
                <DropdownMenuRadioItem value="ai" data-testid="dictate-engine-ai">
                  {t('engineAi')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="browser" data-testid="dictate-engine-browser">
                  {t('engineBrowser')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('language')}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={shown} onValueChange={chooseLanguage}>
            {useServer && (
              <DropdownMenuRadioItem value={AUTO}>{t('autoLong')}</DropdownMenuRadioItem>
            )}
            {locales.map((locale) => (
              <DropdownMenuRadioItem key={locale} value={locale}>
                {localeNames[locale]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
