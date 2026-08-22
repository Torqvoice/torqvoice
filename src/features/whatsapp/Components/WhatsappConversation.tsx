'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Clock, ImagePlus, Loader2, Send, X } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import {
  getWhatsappConversation,
  getWhatsappWindowState,
  sendWhatsappToCustomer,
  deleteWhatsappMessage,
} from '../Actions/whatsappActions'
import { WhatsappMessageBubble, type WhatsappMessageView } from './WhatsappMessageBubble'

export interface WhatsappThread {
  key: string
  customerId: string | null
  name: string
  phone: string
}

/**
 * One conversation, with the compose box the 24 hour rule allows.
 *
 * WhatsApp lets a business write freely only within 24 hours of the customer's
 * last message. That is stated above the box rather than discovered on send,
 * because a mechanic typing a paragraph deserves to know it will arrive as a
 * fixed template.
 */
export function WhatsappConversation({
  thread,
  onSent,
}: {
  thread: WhatsappThread
  /** Lets the surrounding list reload once a message is on its way. */
  onSent?: () => void
}) {
  const t = useTranslations('whatsapp.messages')
  const router = useRouter()
  const [messages, setMessages] = useState<WhatsappMessageView[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [windowState, setWindowState] = useState<{
    open: boolean
    hasTemplate: boolean
    hasMediaTemplate: boolean
  } | null>(null)
  const [isSending, startSending] = useTransition()
  const [mounted, setMounted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    if (!thread.customerId) {
      setMessages([])
      setLoading(false)
      return
    }
    const [conversation, state] = await Promise.all([
      getWhatsappConversation(thread.customerId),
      getWhatsappWindowState(thread.customerId),
    ])
    if (conversation.success && conversation.data) {
      setMessages(conversation.data as unknown as WhatsappMessageView[])
    }
    if (state.success && state.data) {
      setWindowState({
        open: state.data.open,
        hasTemplate: state.data.hasTemplate,
        hasMediaTemplate: state.data.hasMediaTemplate,
      })
    }
    setLoading(false)
  }, [thread.customerId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleAttach = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      const response = await fetch('/api/protected/upload', { method: 'POST', body: form })
      if (!response.ok) throw new Error(t('attachFailed'))
      const { url } = await response.json()
      setAttachment({ url, name: file.name })
    } catch {
      toast.error(t('attachFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleSend = () => {
    if (!thread.customerId) return
    if (!body.trim() && !attachment) return

    startSending(async () => {
      const result = await sendWhatsappToCustomer({
        customerId: thread.customerId as string,
        body: body.trim() || undefined,
        mediaUrl: attachment?.url,
        mediaType: attachment ? 'image' : undefined,
        mediaFilename: attachment?.name,
      })

      if (!result.success) {
        toast.error(result.error ?? t('sendFailed'))
        return
      }
      if (result.data?.usedTemplate) toast.info(t('sentAsTemplateNotice'))

      setBody('')
      setAttachment(null)
      await load()
      // The thread list is server-rendered, so a first message to someone new
      // only appears there once the page reloads its data.
      router.refresh()
      onSent?.()
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  const handleDelete = (message: WhatsappMessageView) => {
    startSending(async () => {
      const result = await deleteWhatsappMessage(message.id)
      if (result.success) {
        setMessages((previous) => previous.filter((item) => item.id !== message.id))
      } else {
        toast.error(result.error ?? t('deleteFailed'))
      }
    })
  }

  const blocked =
    windowState?.open === false &&
    (attachment ? !windowState.hasMediaTemplate : !windowState.hasTemplate)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          messages.map((message) => (
            <WhatsappMessageBubble
              key={message.id}
              message={message}
              mounted={mounted}
              onDelete={handleDelete}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t p-4">
        {!thread.customerId ? (
          <p className="text-sm text-muted-foreground">{t('unknownNumber')}</p>
        ) : (
          <>
            {windowState?.open === false && (
              <p className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {windowState.hasTemplate ? t('windowClosed') : t('windowBlocked')}
                  {!windowState.hasTemplate && (
                    <Link
                      href="/settings/providers?tab=whatsapp"
                      className="ml-1 font-medium text-primary hover:underline"
                    >
                      {t('windowBlockedAction')}
                    </Link>
                  )}
                </span>
              </p>
            )}

            {attachment && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t('removeAttachment')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || isSending || blocked}
                aria-label={t('attach')}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </Button>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={blocked ? t('windowBlockedPlaceholder') : t('placeholder')}
                disabled={blocked}
                rows={2}
                className="min-h-[44px] flex-1 resize-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSend()
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleSend}
                disabled={isSending || blocked || (!body.trim() && !attachment)}
                aria-label={t('send')}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleAttach}
              className="hidden"
            />
          </>
        )}
      </div>
    </div>
  )
}
