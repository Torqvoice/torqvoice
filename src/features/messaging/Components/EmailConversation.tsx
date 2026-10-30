'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { EmailChannelState } from '../Actions/inboxActions'
import { getEmailConversation, sendEmailMessage } from '../Actions/emailThreadActions'
import { replySubject, splitQuotedReply } from '../Lib/inboundMail'
import { MessageText } from './MessageText'

export interface EmailThread {
  key: string
  customerId: string | null
  name: string
  address: string
}

/** Taken from what the action returns, so the view cannot drift from it. */
type EmailConversationData = NonNullable<Awaited<ReturnType<typeof getEmailConversation>>['data']>
type EmailMessageRow = EmailConversationData['messages'][number]
type EmailAttachmentRow = EmailMessageRow['attachments'][number]

/**
 * One email conversation, read like a chat.
 *
 * Mail carries what chat does not: a subject, a quoted copy of everything
 * before it, files. The subject is shown only where it changes, the quote is
 * folded away, and the files sit under the text, so a thread of replies still
 * reads as a conversation rather than a stack of envelopes.
 *
 * Whether there is a box to answer in depends on where replies go. A workshop
 * that sends through its own vendor gets its replies in its own mailbox, so
 * the thread here is history and the answer is a link to the mail app.
 */
export function EmailConversation({
  thread,
  emailState,
  onSent,
  refreshKey,
  className,
}: {
  thread: EmailThread
  emailState: EmailChannelState
  /** Lets the surrounding list reload once a message is on its way. */
  onSent?: () => void
  /**
   * Changes when the list hears of a newer message on this thread, so the
   * history is re-read without being reopened.
   */
  refreshKey?: string
  /** How the surrounding pane wants this sized. */
  className?: string
}) {
  const t = useTranslations('messaging.email')
  const router = useRouter()
  const [messages, setMessages] = useState<EmailMessageRow[]>([])
  const [address, setAddress] = useState(thread.address)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  /** Null until the user edits it, so the subject follows the thread. */
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null)
  const [isSending, startSending] = useTransition()
  const [mounted, setMounted] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  /** Whether the reader is at the newest message, so growth may follow. */
  const atBottom = useRef(true)

  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    const result = await getEmailConversation({
      customerId: thread.customerId,
      contact: thread.address,
    })
    if (result.success && result.data) {
      setMessages(result.data.messages)
      setAddress(result.data.address)
    }
    setLoading(false)
  }, [thread.customerId, thread.address])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // A reply that arrived while this was open: re-read quietly, keeping what
  // is on screen until the new rows are in.
  const lastRefreshKey = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey === lastRefreshKey.current) return
    lastRefreshKey.current = refreshKey
    void load()
  }, [refreshKey, load])

  // Land on the newest message once the history is on screen, not before:
  // scrolling an empty list leaves the reader at the top.
  const initialScrollDone = useRef(false)
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el || loading || messages.length === 0) return

    if (initialScrollDone.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      return
    }
    initialScrollDone.current = true
    // Two frames: one for the messages to render, one for layout to settle.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    })
  }, [messages.length, loading])

  // Thumbnails have no height until they load. Follow the growth, but only
  // while the reader is already at the bottom.
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [messages.length, loading])

  const onScroll = () => {
    const el = scrollAreaRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  /** The subject a reply continues, and the mail it answers. */
  const { lastSubject, answeringId } = useMemo(() => {
    let subject: string | null = null
    let inboundId: string | null = null
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (!subject && message.subject?.trim()) subject = message.subject
      if (!inboundId && message.direction === 'inbound') inboundId = message.id
      if (subject && inboundId) break
    }
    return { lastSubject: subject, answeringId: inboundId }
  }, [messages])

  const defaultSubject = lastSubject ? replySubject(lastSubject) : ''
  const subject = subjectDraft ?? defaultSubject

  const handleSend = () => {
    const customerId = thread.customerId
    // Enter in the box is not disabled while a send is running, so the
    // guard is here: the body is only cleared once the first send is through.
    if (isSending || !customerId || !body.trim()) return

    startSending(async () => {
      const result = await sendEmailMessage({
        customerId,
        subject: subject.trim(),
        body: body.trim(),
        replyToId: answeringId,
      })

      if (!result.success) {
        toast.error(result.error ?? t('sendFailed'))
        return
      }

      setBody('')
      setSubjectDraft(null)
      await load()
      // The thread list is server-rendered, so a first mail to someone new
      // only appears there once the page reloads its data.
      router.refresh()
      onSent?.()
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  const mailto = `mailto:${address}${
    lastSubject ? `?subject=${encodeURIComponent(replySubject(lastSubject))}` : ''
  }`

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        ref={scrollAreaRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          messages.map((message, index) => (
            <EmailMessageItem
              key={message.id}
              message={message}
              showSubject={
                index === 0 ||
                subjectKey(messages[index - 1].subject) !== subjectKey(message.subject)
              }
              mounted={mounted}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {emailState === 'active' && (
        <div className="shrink-0 border-t bg-background p-3 sm:p-4">
          {!thread.customerId ? (
            <p className="text-sm text-muted-foreground">{t('unknownSender')}</p>
          ) : (
            // One card shaped like the mail it becomes: the subject line on
            // top, the body under it, and the send control in a footer, so
            // the subject is not mistaken for a search box above a chat.
            <div className="overflow-hidden rounded-xl border bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <label className="flex items-center gap-3 border-b px-3">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {t('subjectPlaceholder')}
                </span>
                <input
                  value={subject}
                  onChange={(event) => setSubjectDraft(event.target.value)}
                  maxLength={200}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t('placeholder')}
                rows={3}
                className="max-h-60 min-h-[76px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSend()
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2">
                <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  {t('sendHint')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSend}
                  disabled={isSending || !body.trim()}
                  className="ml-auto"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t('send')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {emailState === 'ownVendor' && (
        <div className="shrink-0 border-t bg-background p-4">
          <p className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t('ownVendorThread')}
              <a href={mailto} className="ml-1 font-medium text-primary hover:underline">
                {t('replyFromMailApp')}
              </a>
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * A subject with its reply prefixes and case set aside, so "Re: Brakes"
 * under "Brakes" is the same conversation and does not repeat its heading.
 */
function subjectKey(subject: string | null | undefined): string {
  let base = (subject ?? '').trim()
  const prefix = /^(re|sv|aw|antw|res|odp|ynt|atb|fw|fwd|vs|wg|tr|ответ)\s*:\s*/i
  while (prefix.test(base)) base = base.replace(prefix, '')
  return base.toLowerCase()
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Today's mail shows the time; older mail needs the day too. */
function formatWhen(value: string | Date): string {
  const date = new Date(value)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return time
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

/**
 * One mail in the thread. A document the app sent (an invoice, a quote, a
 * reminder) is an event in the conversation rather than something someone
 * wrote, so it is a quiet line in the middle instead of a bubble.
 */
function EmailMessageItem({
  message,
  showSubject,
  mounted,
}: {
  message: EmailMessageRow
  showSubject: boolean
  mounted: boolean
}) {
  const t = useTranslations('messaging.email')
  const [showQuoted, setShowQuoted] = useState(false)
  const isOutbound = message.direction === 'outbound'
  const failed = message.status === 'failed'
  const flagged = message.spamVerdict === 'FAIL' || message.spamVerdict === 'GRAY'
  const time = mounted ? formatWhen(message.createdAt) : ''

  if (message.kind === 'document') {
    const note = message.body.trim()
    return (
      <div className="flex justify-center">
        <div className="flex max-w-[85%] flex-col items-center gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground/80">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words">
              {t('sentDocument', { subject: message.subject ?? t('attachment') })}
            </span>
          </span>
          {note && <MessageText body={note} className="text-xs" />}
          {message.attachments.length > 0 && (
            <AttachmentChips attachments={message.attachments} isOutbound={false} />
          )}
          <span className="text-[10px]">{time}</span>
          {failed && message.errorMessage && (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {message.errorMessage}
            </p>
          )}
        </div>
      </div>
    )
  }

  const { reply, quoted } = isOutbound
    ? { reply: message.body, quoted: '' }
    : splitQuotedReply(message.body)
  const images = message.attachments.filter((file) => file.contentType.startsWith('image/'))

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'min-w-0 max-w-[75%] space-y-2 rounded-2xl px-4 py-2',
          isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted',
          failed && 'bg-destructive/10 text-foreground'
        )}
      >
        {showSubject && message.subject && (
          <p className="break-words text-xs font-semibold">{message.subject}</p>
        )}

        {reply.trim() && <MessageText body={reply.trim()} />}

        {quoted.trim() && (
          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setShowQuoted((value) => !value)}
            >
              {showQuoted ? t('hideQuoted') : t('showQuoted')}
            </Button>
            {showQuoted && (
              <p className="whitespace-pre-wrap break-words border-l-2 pl-3 text-xs text-muted-foreground">
                {quoted.trim()}
              </p>
            )}
          </div>
        )}

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((file) => (
              <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer">
                {/* Served by our own file route, which next/image would not add anything to. */}
                <img
                  src={file.url}
                  alt={file.fileName}
                  loading="lazy"
                  className="max-h-40 max-w-full rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
        )}

        {message.attachments.length > 0 && (
          <AttachmentChips attachments={message.attachments} isOutbound={isOutbound && !failed} />
        )}

        <div
          className={cn(
            'flex items-center gap-1.5 text-[10px]',
            isOutbound && !failed
              ? 'justify-end text-primary-foreground/70'
              : 'text-muted-foreground'
          )}
        >
          <span>{time}</span>
          {isOutbound && <span className="capitalize">· {message.status}</span>}
        </div>

        {flagged && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {t('spamFlag')}
          </p>
        )}

        {failed && message.errorMessage && (
          <p className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {message.errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}

function AttachmentChips({
  attachments,
  isOutbound,
}: {
  attachments: EmailAttachmentRow[]
  isOutbound: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((file) => {
        const Icon = file.contentType.startsWith('image/') ? ImageIcon : FileText
        return (
          <a
            key={file.id}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
              isOutbound
                ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20'
                : 'bg-background hover:bg-background/70'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{file.fileName}</span>
            <span className={isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
              {formatSize(file.size)}
            </span>
          </a>
        )
      })}
    </div>
  )
}
