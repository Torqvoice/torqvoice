'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { AlertCircle, FileText, Trash2 } from 'lucide-react'

export interface WhatsappMessageView {
  id: string
  direction: string
  body: string | null
  mediaType: string | null
  mediaFilename: string | null
  mediaUrl: string | null
  templateName: string | null
  status: string
  errorMessage: string | null
  createdAt: string | Date
}

/**
 * One message in a conversation.
 *
 * Media is never linked to directly: an inbound attachment lives at the
 * provider behind its credentials, and an outbound one is an internal upload.
 * Both are fetched through our own route, which knows which is which.
 */
export function WhatsappMessageBubble({
  message,
  mounted,
  onDelete,
}: {
  message: WhatsappMessageView
  mounted: boolean
  onDelete?: (message: WhatsappMessageView) => void
}) {
  const t = useTranslations('whatsapp.messages')
  const isOutbound = message.direction === 'outbound'
  const failed = message.status === 'failed'

  const time = mounted
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  const mediaSrc = isOutbound ? message.mediaUrl : `/api/protected/whatsapp/media/${message.id}`

  return (
    <div className={cn('group flex', isOutbound ? 'justify-end' : 'justify-start')}>
      {isOutbound && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(message)}
          className="mr-2 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title={t('delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className={cn(
          'max-w-[75%] space-y-2 rounded-2xl px-4 py-2',
          isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted',
          failed && 'bg-destructive/10 text-foreground'
        )}
      >
        {message.mediaType && mediaSrc && (
          <div className="overflow-hidden rounded-lg">
            {message.mediaType === 'image' ? (
              <Image
                src={mediaSrc}
                alt={message.mediaFilename ?? t('attachment')}
                width={320}
                height={240}
                unoptimized
                className="h-auto w-full max-w-[320px] object-cover"
              />
            ) : (
              <a
                href={mediaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-background/20 px-3 py-2 text-sm underline"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{message.mediaFilename ?? t('attachment')}</span>
              </a>
            )}
          </div>
        )}

        {message.body && <p className="whitespace-pre-wrap text-sm">{message.body}</p>}

        <div
          className={cn(
            'flex items-center gap-1.5 text-[10px]',
            isOutbound && !failed
              ? 'justify-end text-primary-foreground/70'
              : 'text-muted-foreground'
          )}
        >
          <span>{time}</span>
          {message.templateName && <span>· {t('sentAsTemplate')}</span>}
          {isOutbound && <span className="capitalize">· {message.status}</span>}
        </div>

        {failed && message.errorMessage && (
          <p className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {message.errorMessage}
          </p>
        )}
      </div>

      {!isOutbound && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(message)}
          className="ml-2 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title={t('delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
