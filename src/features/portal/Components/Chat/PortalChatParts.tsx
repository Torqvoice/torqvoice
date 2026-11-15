'use client'

import {
  ChevronDown,
  FileText,
  Loader2,
  Paperclip,
  Play,
  Receipt,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import {
  type PortalChatAttachment,
  type PortalChatEvent,
  portalEventIsCard,
} from '../../Lib/chatTypes'
import { PortalLinkButton } from '../Ui'
import type { PortalOutgoing } from './chatThread'

/**
 * The pieces a thread is drawn from: the photos of a message, a message
 * still on its way, the lines and cards for what happened to the car, and
 * the large view of a photo. All in the theme's variables (section 10 of
 * portal-themes.css); none of them fetches anything.
 */

type Translate = (key: string, values?: Record<string, string | number>) => string

/** The file a customer opens large: a photo or a video. */
export interface ChatViewerFile {
  url: string
  kind: 'image' | 'video'
  /** Read aloud and shown under it: "Photo from Jonas". */
  label: string
}

/** The photos, video and files of one message, above its text. */
export function ChatAttachments({
  files,
  who,
  t,
  onOpen,
}: {
  files: (PortalChatAttachment | { url: string; kind: 'image' | 'video' })[]
  /** Who sent them, for the names: "Photo from Jonas". */
  who: string
  t: Translate
  onOpen: (file: ChatViewerFile) => void
}) {
  if (files.length === 0) return null
  const media = files.filter((file) => file.kind !== 'file')
  const others = files.filter((file) => file.kind === 'file')
  return (
    <>
      {media.length > 0 && (
        <div className="p-chat__photos" data-count={Math.min(media.length, 4)}>
          {media.map((file) => {
            const label =
              file.kind === 'video' ? t('video', { name: who }) : t('photo', { name: who })
            return (
              <button
                key={file.url}
                type="button"
                className="p-chat__photo"
                aria-label={t('openLarge', { what: label })}
                onClick={() =>
                  onOpen({ url: file.url, kind: file.kind as 'image' | 'video', label })
                }
              >
                {file.kind === 'video' ? (
                  <>
                    {/* The first frame stands in for a poster. */}
                    <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline />
                    <span className="p-chat__play" aria-hidden>
                      <Play className="h-5 w-5" />
                    </span>
                  </>
                ) : (
                  <img src={file.url} alt={label} loading="lazy" />
                )}
              </button>
            )
          })}
        </div>
      )}
      {others.map((file) => (
        <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="p-chat__file">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          {t('file')}
        </a>
      ))}
    </>
  )
}

/** A message the customer sent that is still on its way, or did not get there. */
export function ChatOutgoing({
  outgoing,
  t,
  onOpen,
  onRetry,
  onDiscard,
}: {
  outgoing: PortalOutgoing
  t: Translate
  onOpen: (file: ChatViewerFile) => void
  onRetry: () => void
  onDiscard: () => void
}) {
  const failed = outgoing.state === 'failed'
  const reason =
    outgoing.problem === 'chat_off'
      ? t('errors.chatOff')
      : outgoing.problem === 'too_fast'
        ? t('errors.tooFast')
        : t('errors.notSent')
  return (
    <div className="contents">
      <div
        className="p-bubble p-bubble--me"
        data-state={outgoing.state}
        aria-busy={!failed || undefined}
      >
        <ChatAttachments files={outgoing.previews} who={t('you')} t={t} onOpen={onOpen} />
        {outgoing.body}
      </div>
      {failed ? (
        <div className="p-chat__failed" role="alert">
          <span>{reason}</span>
          <span className="flex flex-wrap justify-end gap-x-3">
            <button type="button" className="p-chat__textbtn" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('retry')}
            </button>
            <button type="button" className="p-chat__textbtn" onClick={onDiscard}>
              <X className="h-3.5 w-3.5" aria-hidden />
              {t('discard')}
            </button>
          </span>
        </div>
      ) : (
        <p className="p-chat__meta p-chat__meta--me">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin align-[-2px]" aria-hidden />
          {t('sending')}
        </p>
      )}
    </div>
  )
}

/** What a quiet event says in one line: "Invoice XT-1009 · 2 732,63 kr". */
function eventLineText(event: PortalChatEvent, t: Translate): string {
  if (event.kind === 'work_started') {
    return event.vehicle
      ? t('events.workStarted', { vehicle: event.vehicle })
      : t('events.workStartedNoVehicle')
  }
  const name =
    event.kind === 'quote'
      ? event.title
        ? t('events.quoteLine', { title: event.title })
        : t('events.quote')
      : event.kind === 'invoice'
        ? event.title
          ? t('events.invoiceLine', { title: event.title })
          : t('events.invoice')
        : (event.title ?? t('events.seeUpdate'))
  return [name, event.amount].filter(Boolean).join(' · ')
}

const LINE_ICON = { work_started: Wrench, update: Play, quote: FileText, invoice: Receipt } as const

/**
 * One quiet event: an icon, what happened and when, across the column. The
 * whole line is the link when there is something to open.
 */
function ChatEventLine({ event, time, t }: { event: PortalChatEvent; time: string; t: Translate }) {
  const Icon = LINE_ICON[event.kind]
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{eventLineText(event, t)}</span>
      <time dateTime={event.at} className="shrink-0">
        {time}
      </time>
    </>
  )
  return event.href ? (
    <Link href={event.href} className="p-chat__event p-chat__event--link">
      {inner}
    </Link>
  ) : (
    <p className="p-chat__event">{inner}</p>
  )
}

/**
 * Something that happened to the car or the papers. What waits for the
 * customer is a card with the one thing to do: a quote to answer, an invoice
 * that is overdue, an update the workshop shared. Everything else is a line.
 */
export function ChatEvent({
  event,
  workshopName,
  time,
  t,
}: {
  event: PortalChatEvent
  workshopName: string
  /** When it happened, already printed on the workshop's clock. */
  time: string
  t: Translate
}) {
  if (!portalEventIsCard(event)) return <ChatEventLine event={event} time={time} t={t} />

  const Icon = LINE_ICON[event.kind]
  const label =
    event.kind === 'update'
      ? t('events.update', { workshop: workshopName })
      : event.kind === 'quote'
        ? t('events.quoteWaiting')
        : t('events.invoiceOverdue')
  const action =
    event.kind === 'update'
      ? t('events.seeUpdate')
      : event.kind === 'quote'
        ? t('events.answerQuote')
        : t('events.seeInvoice')
  const facts = [event.kind === 'update' ? null : event.vehicle, event.amount].filter(Boolean)
  const title =
    event.title ??
    (event.kind === 'update' && event.vehicle
      ? t('events.updateAbout', { vehicle: event.vehicle })
      : null)

  return (
    <article
      className="p-chat__card"
      data-tone={event.overdue ? 'danger' : undefined}
      aria-label={label}
    >
      <p className="p-chat__cardhead">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <time dateTime={event.at}>{time}</time>
      </p>
      {title && <p className="p-chat__cardtitle">{title}</p>}
      {facts.length > 0 && <p className="p-chat__cardfacts">{facts.join(' · ')}</p>}
      {event.href && (
        <PortalLinkButton
          href={event.href}
          variant={event.kind === 'update' ? 'outline' : 'accent'}
          block
          className="mt-2.5 min-h-[40px] text-sm"
        >
          {action}
        </PortalLinkButton>
      )}
    </article>
  )
}

/**
 * Several quiet events of one kind on one day, as one line that opens:
 * "5 invoices". Closed, it takes the room of a single event.
 */
export function ChatEventGroup({
  kind,
  events,
  time,
  t,
}: {
  kind: PortalChatEvent['kind']
  events: PortalChatEvent[]
  /** Prints an event's time on the workshop's clock. */
  time: (iso: string) => string
  t: Translate
}) {
  const Icon = LINE_ICON[kind]
  const count = events.length
  const label =
    kind === 'invoice'
      ? t('events.invoices', { count })
      : kind === 'quote'
        ? t('events.quotes', { count })
        : // An update is always a card, so what is left is work starting.
          t('events.jobsStarted', { count })
  return (
    <details className="p-chat__group">
      <summary className="p-chat__event p-chat__event--link">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="p-chat__groupmark h-4 w-4 shrink-0" aria-hidden />
      </summary>
      <div className="p-chat__groupbody">
        {events.map((event) => (
          <ChatEventLine key={event.id} event={event} time={time(event.at)} t={t} />
        ))}
      </div>
    </details>
  )
}

/**
 * A photo or video, large. A native dialog: it stays inside the portal's
 * root in the document, so the theme's variables reach it, while the browser
 * lifts it above the page, traps the keyboard in it and closes it on Escape.
 */
export function ChatViewer({
  file,
  closeLabel,
  onClose,
}: {
  file: ChatViewerFile | null
  closeLabel: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (file && !element.open) {
      // Browsers without showModal still show it, in place.
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    } else if (!file && element.open) {
      if (typeof element.close === 'function') element.close()
      else element.removeAttribute('open')
    }
  }, [file])

  return (
    <dialog
      ref={dialog}
      className="p-chat__viewer"
      aria-label={file?.label}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // The dialog itself is the dark surround; the picture is inside it.
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      {file && (
        <>
          <button
            type="button"
            className="p-iconbtn p-chat__viewerclose"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
          {file.kind === 'video' ? (
            <video src={file.url} controls autoPlay playsInline />
          ) : (
            <img src={file.url} alt={file.label} />
          )}
        </>
      )}
    </dialog>
  )
}
