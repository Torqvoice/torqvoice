'use client'

import { ChevronUp, ImagePlus, Loader2, Paperclip, Send, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useNotificationStore } from '@/features/notifications/store/notificationStore'
import { useRecordChanges } from '@/features/realtime/hooks'
import { PORTAL_THREAD_HINT } from '@/lib/realtime/events'
import {
  PORTAL_MESSAGE_MAX_LENGTH,
  PORTAL_MESSAGE_MAX_PHOTOS,
} from '@/features/portal/Lib/chatTypes'
import {
  PORTAL_PHOTO_MAX_BYTES,
  PORTAL_PHOTO_TYPES,
  megabytes,
} from '@/features/portal/Lib/portalUploads'
import { cn } from '@/lib/utils'
import {
  type PortalInboxMessage,
  getPortalConversation,
  markPortalMessagesSeen,
  sendPortalReply,
} from '../Actions/portalThreadActions'
import { setActiveConversation } from '../activeConversation'
import { MessageText } from './MessageText'

/**
 * A customer's thread from the portal's chat, read and answered by the
 * workshop. The same shape as the other channels' conversations (the inbox
 * places it in the same pane), with what this channel has that they do not:
 * photos in both directions, who at the workshop wrote, and whether the
 * customer has seen the answer.
 *
 * It loads its own history, re-reads it when the inbox says something
 * arrived (`refreshKey`, and the notification for this thread), and tells
 * the notification feed it is the conversation on screen, so a message for
 * it does not ring the bell.
 */

/** The link an inbound portal message's notification carries. */
export const portalThreadUrl = (customerId: string) =>
  `/messages?channel=portal&customerId=${customerId}`

const uploadedSchema = z.object({ url: z.string().min(1) })

interface Draft {
  id: string
  name: string
  previewUrl: string
  /** Null while it uploads. */
  storedUrl: string | null
}

export function PortalConversation({
  customerId,
  customerName,
  onSent,
  onRead,
  readSignal,
  refreshKey,
  className,
}: {
  customerId: string
  customerName: string
  /** Asks the inbox to reload its list: the thread moved to the top. */
  onSent?: () => void
  /** Messages of the customer were marked read: the unread counts have changed. */
  onRead?: () => void
  /**
   * Changes each time the inbox reads the thread: when it is opened, selected
   * again, or something new arrived in it. What is on screen is then marked
   * read again, also a message that was put back as unread meanwhile.
   */
  readSignal?: number
  /** Changes when the inbox learns of a newer message in this thread. */
  refreshKey?: string
  className?: string
}) {
  const t = useTranslations('messaging.portal')
  // On the workshop's clock, the day in its date format.
  const { formatDateTime } = useFormatDate()
  const [messages, setMessages] = useState<PortalInboxMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [canReply, setCanReply] = useState(true)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [body, setBody] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isSending, startSend] = useTransition()
  const [isLoadingOlder, startLoadOlder] = useTransition()
  const scroller = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    setActiveConversation([portalThreadUrl(customerId)])
    return () => setActiveConversation(null)
  }, [customerId])

  const load = useCallback(async () => {
    // An action that cannot reach the server throws instead of answering.
    const result = await getPortalConversation(customerId).catch(() => null)
    if (result?.success && result.data) {
      setMessages(result.data.messages)
      setNextCursor(result.data.nextCursor)
      setCanReply(result.data.canReply)
      setState('ready')
    } else {
      // A re-read that fails keeps what is on screen.
      setState((current) => (current === 'ready' ? 'ready' : 'failed'))
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // Live: a portal message written, read or deleted on either side is a
  // change of this customer (hint "portal") on the app's socket, and after a
  // reconnection (null) something may have been missed. So a new message
  // from the customer shows at once, also while this very conversation is
  // open and its notification is kept quiet, and "Seen" appears when the
  // customer opens the answer.
  useRecordChanges(
    'customer',
    customerId,
    useCallback(
      (change) => {
        if (!change || change.hint === PORTAL_THREAD_HINT) void load()
      },
      [load]
    )
  )

  // The notification for this thread, for a page where the socket's rooms
  // are not available. Told apart by its id: the feed keeps fifty, so its
  // length stops growing.
  useEffect(() => {
    let lastId = useNotificationStore.getState().notifications[0]?.id
    return useNotificationStore.subscribe((store) => {
      const latest = store.notifications[0]
      if (!latest || latest.id === lastId) return
      lastId = latest.id
      if (latest.type === 'portal_inbound' && latest.entityUrl === portalThreadUrl(customerId)) {
        void load()
      }
    })
  }, [customerId, load])

  // What the customer wrote is read once it is on screen here: the unread
  // messages this conversation shows, by id. One that arrives after this
  // read of the thread is marked when it shows, not before, and older ones
  // above the loaded page when they are loaded.
  //
  // A message is marked once per reading. "Mark as unread" in the inbox puts
  // the newest one back while the conversation stays open, and it must stay
  // unread until the thread is read again (`readSignal`), not be stamped
  // straight away by the re-read its own change causes.
  const shownUnreadKey = messages
    .filter((message) => message.direction === 'inbound' && !message.readAt)
    .map((message) => message.id)
    .join(',')
  const reading = useRef<{ signal: number | undefined; done: Set<string>; asked: string | null }>({
    signal: readSignal,
    done: new Set(),
    asked: null,
  })
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead
  useEffect(() => {
    if (reading.current.signal !== readSignal) {
      reading.current = { signal: readSignal, done: new Set(), asked: null }
    }
    const now = reading.current
    const ids = shownUnreadKey.split(',').filter((id) => id && !now.done.has(id))
    const key = ids.join(',')
    if (state !== 'ready' || ids.length === 0 || now.asked === key) return
    now.asked = key
    const forget = () => {
      // Not told: the next change of the thread tries again.
      if (now.asked === key) now.asked = null
    }
    markPortalMessagesSeen({ customerId, ids })
      .then((result) => {
        if (!result.success) return forget()
        for (const id of ids) now.done.add(id)
        const at = new Date().toISOString()
        setMessages((current) =>
          current.map((message) =>
            ids.includes(message.id) && !message.readAt ? { ...message, readAt: at } : message
          )
        )
        if ((result.data?.marked ?? 0) > 0) onReadRef.current?.()
      })
      .catch(forget)
  }, [state, shownUnreadKey, customerId, readSignal])

  // The newest message is what a conversation is opened for.
  const settled = useRef(false)
  const lastId = messages[messages.length - 1]?.id
  useEffect(() => {
    const element = scroller.current
    if (!element || state !== 'ready') return
    if (!settled.current) {
      settled.current = true
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight
      })
    } else {
      element.scrollTo?.({ top: element.scrollHeight, behavior: 'smooth' })
    }
  }, [lastId, state])

  const loadOlder = () => {
    if (!nextCursor) return
    startLoadOlder(async () => {
      const result = await getPortalConversation(customerId, nextCursor).catch(() => null)
      if (result?.success && result.data) {
        const older = result.data.messages
        setMessages((current) => [...older, ...current])
        setNextCursor(result.data.nextCursor)
      }
    })
  }

  const addPhotos = (files: File[]) => {
    for (const file of files) {
      if (drafts.length >= PORTAL_MESSAGE_MAX_PHOTOS) {
        toast.error(t('tooManyPhotos', { count: PORTAL_MESSAGE_MAX_PHOTOS }))
        return
      }
      const failed = () =>
        toast.error(t('uploadFailed', { size: megabytes(PORTAL_PHOTO_MAX_BYTES) }))
      if (
        !(PORTAL_PHOTO_TYPES as readonly string[]).includes(file.type.toLowerCase()) ||
        file.size > PORTAL_PHOTO_MAX_BYTES
      ) {
        failed()
        continue
      }
      const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const previewUrl = URL.createObjectURL(file)
      setDrafts((list) => [...list, { id, name: file.name, previewUrl, storedUrl: null }])
      const form = new FormData()
      form.append('file', file)
      fetch('/api/protected/upload/portal-message', { method: 'POST', body: form })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status))
          return uploadedSchema.parse(await response.json())
        })
        .then(({ url }) =>
          setDrafts((list) =>
            list.map((draft) => (draft.id === id ? { ...draft, storedUrl: url } : draft))
          )
        )
        .catch(() => {
          URL.revokeObjectURL?.(previewUrl)
          setDrafts((list) => list.filter((draft) => draft.id !== id))
          failed()
        })
    }
  }

  const removeDraft = (id: string) => {
    const draft = drafts.find((one) => one.id === id)
    if (draft) URL.revokeObjectURL?.(draft.previewUrl)
    setDrafts((list) => list.filter((one) => one.id !== id))
  }

  const uploading = drafts.some((draft) => !draft.storedUrl)
  const text = body.trim()
  const canSend = canReply && !isSending && !uploading && (text.length > 0 || drafts.length > 0)

  const send = () => {
    if (!canSend) return
    const sending = drafts
    setBody('')
    setDrafts([])
    startSend(async () => {
      // Caught: thrown inside a transition it would take the page down. A
      // send that failed puts the text and the photos back to send again.
      const result = await sendPortalReply({
        customerId,
        body: text,
        attachments: sending.flatMap((draft) => (draft.storedUrl ? [draft.storedUrl] : [])),
      }).catch(() => null)
      if (result?.success && result.data) {
        const sent = result.data.message
        setMessages((current) => [...current.filter((message) => message.id !== sent.id), sent])
        for (const draft of sending) URL.revokeObjectURL?.(draft.previewUrl)
        onSent?.()
      } else {
        toast.error(result?.error ?? t('sendFailed'))
        setBody(text)
        setDrafts(sending)
      }
    })
  }

  const when = (iso: string) => (mounted ? formatDateTime(iso) : '')

  return (
    <div className={cn('flex h-[500px] flex-col', className)}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {state === 'loading' && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {state === 'failed' && (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <p>{t('loadFailed')}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {t('tryAgain')}
            </Button>
          </div>
        )}
        {state === 'ready' && nextCursor && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={loadOlder} disabled={isLoadingOlder}>
              {isLoadingOlder ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ChevronUp className="mr-1 h-3 w-3" />
              )}
              {t('loadOlder')}
            </Button>
          </div>
        )}
        {state === 'ready' && messages.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('empty', { name: customerName })}
          </p>
        )}
        {messages.map((message) => {
          const ours = message.direction === 'outbound'
          const who = ours ? (message.authorName ?? t('you')) : customerName
          return (
            <div key={message.id} className={cn('flex', ours ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-2',
                  ours ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}
              >
                {message.attachments.length > 0 && (
                  <div className={cn('flex flex-wrap gap-1.5', message.body && 'mb-2')}>
                    {message.attachments.map((file) =>
                      file.kind === 'image' ? (
                        <button
                          key={file.url}
                          type="button"
                          className="overflow-hidden rounded-lg"
                          onClick={() =>
                            setViewing({ url: file.url, label: t('photoFrom', { name: who }) })
                          }
                        >
                          <img
                            src={file.url}
                            alt={t('photoFrom', { name: who })}
                            loading="lazy"
                            className="h-28 w-28 object-cover"
                          />
                        </button>
                      ) : file.kind === 'video' ? (
                        <video
                          key={file.url}
                          src={file.url}
                          controls
                          preload="metadata"
                          aria-label={t('videoFrom', { name: who })}
                          className="max-h-56 w-full rounded-lg"
                        />
                      ) : (
                        <a
                          key={file.url}
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {t('openFile')}
                        </a>
                      )
                    )}
                  </div>
                )}
                {message.body && <MessageText body={message.body} />}
                <div
                  className={cn(
                    'mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px]',
                    ours ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground'
                  )}
                >
                  {ours && message.authorName && <span>{message.authorName}</span>}
                  <span>{when(message.createdAt)}</span>
                  {ours && message.readAt && <span>{t('seen')}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {canReply ? (
        <div className="shrink-0 space-y-2 border-t bg-background p-4">
          {drafts.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {drafts.map((draft) => (
                <li key={draft.id} className="relative h-16 w-16 overflow-hidden rounded-md border">
                  <img
                    src={draft.previewUrl}
                    alt={draft.name}
                    className="h-full w-full object-cover"
                  />
                  {!draft.storedUrl && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    aria-label={t('removePhoto', { name: draft.name })}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={picker}
              type="file"
              accept={PORTAL_PHOTO_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                addPhotos(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('addPhoto')}
              onClick={() => picker.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Textarea
              placeholder={t('placeholder', { name: customerName })}
              aria-label={t('placeholder', { name: customerName })}
              value={body}
              maxLength={PORTAL_MESSAGE_MAX_LENGTH}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                send()
              }}
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={!canSend} size="icon" aria-label={t('send')}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {/* No text or email goes out for an answer here, so say when it is read. */}
          <p className="text-xs text-muted-foreground">{t('sendHint', { name: customerName })}</p>
        </div>
      ) : (
        state === 'ready' && (
          <div className="shrink-0 border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {t('off')}{' '}
            <Link
              href="/settings/customer-portal"
              className="font-medium text-primary hover:underline"
            >
              {t('offSettings')}
            </Link>
          </div>
        )
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{viewing?.label}</DialogTitle>
          {viewing && (
            <img
              src={viewing.url}
              alt={viewing.label}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
