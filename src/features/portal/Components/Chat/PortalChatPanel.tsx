'use client'

import { ArrowDown, Camera, Loader2, MessageSquare, Phone, SendHorizontal, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  PORTAL_MESSAGE_MAX_LENGTH,
  PORTAL_MESSAGE_MAX_PHOTOS,
  PORTAL_THREAD_STEP,
  type PortalChatEvent,
  type PortalChatMessage,
} from '../../Lib/chatTypes'
import {
  PORTAL_PHOTO_MAX_BYTES,
  PORTAL_UPLOAD_ACCEPT,
  PORTAL_VIDEO_MAX_BYTES,
  megabytes,
} from '../../Lib/portalUploads'
import { PortalIconButton } from '../Ui'
import {
  ChatAttachments,
  ChatEvent,
  ChatEventGroup,
  ChatOutgoing,
  ChatViewer,
  type ChatViewerFile,
} from './PortalChatParts'
import {
  buildPortalThread,
  type PortalChatStampKind,
  type PortalChatStamps,
  portalChatFormats,
  workshopDayKey,
} from './chatThread'
import { useChatUploads } from './useChatUploads'
import { useChatVisible } from './useChatVisible'
import { usePortalThread } from './usePortalThread'

/**
 * The chat between the customer and the workshop, as one block that fills
 * whatever box it is put in: a column on the desktop home, the whole screen
 * on the Messages page. It draws its own header (who the chat is with, a call
 * button), the thread and the composer, in the theme's variables.
 *
 * The props are the contract with the pages and the themes. Inside, it is a
 * messenger: the thread under a line per day on the workshop's calendar, the
 * workshop's bubbles on the left and the customer's on the right, photos
 * that open large, lines and cards for what happened to the car (work
 * started, an update, a quote, an invoice), a message shown the moment it is
 * sent and marked when it did not get there, and a poll that keeps it
 * current.
 *
 * A theme may place it inside a box that is hidden on a phone (the home
 * shows the chat only on a desk). The panel neither polls nor marks messages
 * read while it is not visible (see useChatVisible).
 */
export interface PortalChatPanelProps {
  /** The slug or id in the address, for links and requests. */
  orgParam: string
  workshopName: string
  /** The workshop's phone as a `tel:` address; no call button without one. */
  callHref: string | null
  /** False when the customer may read but not write (the chat was turned off). */
  enabled: boolean
  /** The end of the thread as the server read it, oldest first. */
  initialMessages: PortalChatMessage[]
  /**
   * What happened around those messages, as the server read it. Optional:
   * without it the events arrive with the chat's first poll.
   */
  initialEvents?: PortalChatEvent[]
  /** How times are printed: the workshop's zone and its 12 or 24 hour clock. */
  clock: { timeZone: string; timeFormat: '12h' | '24h' }
  /**
   * The times and days of that first thread as the server printed them, so
   * the page reads the same before and after the browser takes over. Optional:
   * without it the browser prints them itself.
   */
  stamps?: PortalChatStamps
  /**
   * 'panel' sits in a box among other things and has its own header; 'page'
   * is the Messages page, where the page already says what this is, so the
   * header is only the call button's row.
   */
  variant?: 'panel' | 'page'
}

/** How close to the end the thread must be to follow new messages by itself. */
const PINNED_WITHIN = 80
/** The composer grows with the text up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT = 132

export function PortalChatPanel({
  orgParam,
  workshopName,
  callHref,
  enabled,
  initialMessages,
  initialEvents,
  clock,
  stamps,
  variant = 'panel',
}: PortalChatPanelProps) {
  const t = useTranslations('portal.chat')
  const locale = useLocale()
  const inputId = useId()
  const hintId = useId()
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  const visible = useChatVisible(root)
  const initial = useMemo(
    () => ({
      enabled,
      unread: 0,
      messages: initialMessages,
      events: initialEvents ?? [],
      hasEarlier: initialMessages.length >= PORTAL_THREAD_STEP,
    }),
    [enabled, initialMessages, initialEvents]
  )
  const { thread, outgoing, send, retry, discard, showEarlier, loadingEarlier, canShowEarlier } =
    usePortalThread({ orgParam, initial, visible })
  const tray = useChatUploads(orgParam)
  const [draft, setDraft] = useState('')
  const [viewing, setViewing] = useState<ChatViewerFile | null>(null)
  const [newBelow, setNewBelow] = useState(false)
  // The workshop can turn the chat off while a customer has it open.
  const canWrite = enabled && thread.enabled

  const formats = useMemo(
    () => portalChatFormats(locale, { timeZone: clock.timeZone, timeFormat: clock.timeFormat }),
    [locale, clock.timeZone, clock.timeFormat]
  )
  /**
   * A moment as the thread prints it. What the server already printed is
   * shown as it is (see `PortalChatStamps`): printing it again here could
   * give another text than the page arrived with.
   */
  const stamp = (iso: string, kind: PortalChatStampKind) =>
    stamps?.[iso]?.[kind] ?? formats[kind].format(new Date(iso))

  const items = useMemo(
    () => buildPortalThread(thread.messages, thread.events, outgoing, clock.timeZone),
    [thread.messages, thread.events, outgoing, clock.timeZone]
  )

  /**
   * When an event happened, on the workshop's clock. One that is only a
   * calendar day (an invoice on its own date) prints the day, never a time.
   */
  const eventWhen = (event: PortalChatEvent) => stamp(event.at, event.dayOnly ? 'shortDay' : 'time')

  /** "Today", "Yesterday", or the day in words, on the workshop's calendar. */
  const dayLabel = (iso: string) => {
    const key = workshopDayKey(iso, clock.timeZone)
    const now = Date.now()
    if (key === workshopDayKey(new Date(now).toISOString(), clock.timeZone)) return t('today')
    if (key === workshopDayKey(new Date(now - 86_400_000).toISOString(), clock.timeZone)) {
      return t('yesterday')
    }
    const sameYear =
      key.slice(0, 4) === workshopDayKey(new Date(now).toISOString(), clock.timeZone).slice(0, 4)
    return stamp(iso, sameYear ? 'day' : 'dayWithYear')
  }

  // ── Keeping the newest message in view ──────────────────────────────────
  const pinned = useRef(true)
  const toEnd = useCallback(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
    pinned.current = true
    setNewBelow(false)
  }, [])
  const onScroll = () => {
    const element = scroller.current
    if (!element) return
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < PINNED_WITHIN
    if (pinned.current) setNewBelow(false)
  }

  const lastKey = items[items.length - 1]?.key ?? ''
  const firstKey = items[0]?.key ?? ''
  const before = useRef({ lastKey, firstKey, height: 0 })
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const was = before.current
    const last = items[items.length - 1]
    if (pinned.current || last?.type === 'outgoing') {
      // At the end already, or the customer just wrote: follow.
      toEnd()
    } else if (was.firstKey !== firstKey && was.lastKey === lastKey) {
      // Earlier messages came in above: stay on the message being read.
      element.scrollTop += element.scrollHeight - was.height
    } else if (was.lastKey !== lastKey) {
      // Reading further up while something new arrived: say so, do not jump.
      setNewBelow(true)
    }
    before.current = { lastKey, firstKey, height: element.scrollHeight }
  }, [lastKey, firstKey])

  // A photo that loads, or a box that appears (the chat hidden on a phone,
  // then shown), changes the height after the fact.
  const empty = items.length === 0
  useEffect(() => {
    const element = list.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (pinned.current) toEnd()
      if (scroller.current) before.current.height = scroller.current.scrollHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [toEnd, empty])
  useEffect(() => {
    if (visible && pinned.current) toEnd()
  }, [visible, toEnd])

  // ── Writing ─────────────────────────────────────────────────────────────
  const fit = () => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }
  useLayoutEffect(fit, [draft])

  const body = draft.trim()
  const ready = tray.uploads.filter((upload) => upload.state === 'ready')
  const canSend = canWrite && !tray.busy && (body.length > 0 || ready.length > 0)

  const submit = () => {
    if (!canSend) return
    const files = tray.take()
    send({
      body,
      previews: files.map((file) => ({ url: file.previewUrl, kind: file.kind })),
      attachments: files.flatMap((file) => (file.storedUrl ? [file.storedUrl] : [])),
    })
    setDraft('')
    pinned.current = true
    input.current?.focus()
  }

  const uploadProblem =
    tray.problem === 'tooMany'
      ? t('upload.tooMany', { count: PORTAL_MESSAGE_MAX_PHOTOS })
      : tray.problem === 'tooLarge'
        ? t('upload.tooLarge', {
            photo: megabytes(PORTAL_PHOTO_MAX_BYTES),
            video: megabytes(PORTAL_VIDEO_MAX_BYTES),
          })
        : tray.problem === 'type'
          ? t('upload.type')
          : tray.problem === 'failed'
            ? t('upload.failed')
            : null

  // The newest of the customer's own messages the workshop has opened.
  const seenId = useMemo(() => {
    const last = thread.messages[thread.messages.length - 1]
    return last?.direction === 'inbound' && last.readAt ? last.id : null
  }, [thread.messages])

  const suggestions = [t('suggestions.call'), t('suggestions.book'), t('suggestions.invoice')]

  return (
    <div ref={root} className="p-chat" data-variant={variant}>
      <div className="p-chat__head">
        <div className="min-w-0 flex-1">
          {variant === 'panel' ? (
            <h2 className="text-base font-semibold leading-tight">{t('title')}</h2>
          ) : null}
          <p className="p-muted truncate text-[13px] leading-snug">
            {t('subtitle', { workshop: workshopName })}
          </p>
        </div>
        {callHref && (
          <PortalIconButton href={callHref} label={t('call', { workshop: workshopName })}>
            <Phone className="h-[18px] w-[18px]" aria-hidden />
          </PortalIconButton>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* A thread is read by scrolling it, so it can be reached by keyboard. */}
        <div
          ref={scroller}
          className="p-chat__thread"
          role="log"
          aria-label={t('label', { workshop: workshopName })}
          tabIndex={0}
          onScroll={onScroll}
        >
          {empty ? (
            <div className="p-chat__empty">
              <span className="p-chat__emptymark" aria-hidden>
                <MessageSquare className="h-6 w-6" />
              </span>
              <p className="p-chat__emptytitle">{t('emptyTitle')}</p>
              <p className="p-chat__emptybody">
                {canWrite ? t('emptyBody', { workshop: workshopName }) : t('emptyBodyOff')}
              </p>
              {canWrite && (
                <ul className="p-chat__suggestions" aria-label={t('suggestions.label')}>
                  {suggestions.map((text) => (
                    <li key={text}>
                      <button
                        type="button"
                        className="p-chat__suggestion"
                        onClick={() => {
                          setDraft(text)
                          input.current?.focus()
                        }}
                      >
                        {text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div ref={list} className="p-chat__list">
              {canShowEarlier && (
                <button
                  type="button"
                  className="p-chat__textbtn self-center"
                  onClick={showEarlier}
                  disabled={loadingEarlier}
                >
                  {loadingEarlier && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {t('earlier')}
                </button>
              )}
              {items.map((item) => {
                if (item.type === 'day') {
                  return (
                    <p key={item.key} className="p-chat__day">
                      <span>{dayLabel(item.at)}</span>
                    </p>
                  )
                }
                if (item.type === 'event') {
                  return (
                    <ChatEvent
                      key={item.key}
                      event={item.event}
                      workshopName={workshopName}
                      time={eventWhen(item.event)}
                      t={t}
                    />
                  )
                }
                if (item.type === 'events') {
                  return (
                    <ChatEventGroup
                      key={item.key}
                      kind={item.kind}
                      events={item.events}
                      time={eventWhen}
                      t={t}
                    />
                  )
                }
                if (item.type === 'outgoing') {
                  return (
                    <ChatOutgoing
                      key={item.key}
                      outgoing={item.outgoing}
                      t={t}
                      onOpen={setViewing}
                      onRetry={() => retry(item.outgoing.localId)}
                      onDiscard={() => discard(item.outgoing.localId)}
                    />
                  )
                }
                const { message } = item
                const mine = message.direction === 'inbound'
                const who = mine ? t('you') : (message.authorName ?? workshopName)
                return (
                  <div key={item.key} className="contents">
                    <div className={mine ? 'p-bubble p-bubble--me' : 'p-bubble p-bubble--them'}>
                      <ChatAttachments
                        files={message.attachments}
                        who={who}
                        t={t}
                        onOpen={setViewing}
                      />
                      {message.body}
                    </div>
                    {item.closesRun && (
                      <p className={mine ? 'p-chat__meta p-chat__meta--me' : 'p-chat__meta'}>
                        {who} · {stamp(message.createdAt, 'time')}
                        {message.id === seenId && ` · ${t('seen')}`}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {newBelow && (
          <button type="button" className="p-chat__jump" onClick={toEnd}>
            <ArrowDown className="h-4 w-4" aria-hidden />
            {t('newBelow')}
          </button>
        )}
      </div>

      {canWrite ? (
        <form
          className="p-chat__composer"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {(tray.uploads.length > 0 || uploadProblem) && (
            <div className="p-chat__tray">
              {tray.uploads.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {tray.uploads.map((upload) => (
                    <li key={upload.id} className="p-chat__thumb" data-state={upload.state}>
                      {upload.kind === 'video' ? (
                        <video src={upload.previewUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={upload.previewUrl} alt={upload.name} />
                      )}
                      {upload.state === 'uploading' && (
                        <span className="p-chat__thumbwait" role="status">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          <span className="sr-only">
                            {t('upload.adding', { name: upload.name })}
                          </span>
                        </span>
                      )}
                      <button
                        type="button"
                        className="p-chat__thumbremove"
                        aria-label={t('upload.remove', { name: upload.name })}
                        onClick={() => tray.remove(upload.id)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {uploadProblem && (
                <p className="p-chat__problem" role="alert">
                  {uploadProblem}
                </p>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={picker}
              type="file"
              accept={PORTAL_UPLOAD_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                tray.add(Array.from(event.target.files ?? []))
                // The same photo can be picked again after it was removed.
                event.target.value = ''
              }}
            />
            <PortalIconButton
              label={t('addPhoto')}
              disabled={tray.full}
              onClick={() => picker.current?.click()}
            >
              <Camera className="h-[18px] w-[18px]" aria-hidden />
            </PortalIconButton>
            <label htmlFor={inputId} className="sr-only">
              {t('inputLabel', { workshop: workshopName })}
            </label>
            <textarea
              ref={input}
              id={inputId}
              className="p-input p-chat__input"
              rows={1}
              value={draft}
              maxLength={PORTAL_MESSAGE_MAX_LENGTH}
              placeholder={t('placeholder', { workshop: workshopName })}
              aria-describedby={hintId}
              enterKeyHint="send"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter is a new line. Enter that only
                // confirms a word being composed (Japanese, Korean) is neither.
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                submit()
              }}
            />
            <span id={hintId} className="sr-only">
              {t('keysHint')}
            </span>
            <PortalIconButton
              label={t('send')}
              // The one main action of the chat: the workshop's colour once
              // there is something to send, a plain but clear button before.
              variant={canSend ? 'accent' : 'outline'}
              className="p-chat__send"
              type="submit"
              disabled={!canSend}
            >
              <SendHorizontal className="h-[18px] w-[18px]" aria-hidden />
            </PortalIconButton>
          </div>
        </form>
      ) : (
        <div className="p-chat__off">
          <p>{t('off')}</p>
          {callHref && (
            <a href={callHref} className="p-link">
              {t('call', { workshop: workshopName })}
            </a>
          )}
        </div>
      )}

      <ChatViewer file={viewing} closeLabel={t('closeViewer')} onClose={() => setViewing(null)} />
    </div>
  )
}
