'use client'

import { cn } from '@/lib/utils'
import { MessageCircle, MessageSquare, Send } from 'lucide-react'
import type { MessagingChannel } from '../Actions/inboxActions'

/**
 * Says which transport a conversation is on.
 *
 * In a merged inbox this is the one thing a mechanic has to know before
 * replying, so it reads as a word rather than an icon alone: a green dot is
 * not an answer to "will this reach them on WhatsApp or as a text?".
 */
const STYLES: Record<MessagingChannel, { label: string; className: string; Icon: typeof Send }> = {
  sms: {
    label: 'SMS',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    Icon: MessageSquare,
  },
  whatsapp: {
    label: 'WhatsApp',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    Icon: MessageCircle,
  },
  telegram: {
    label: 'Telegram',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    Icon: Send,
  },
}

export function ChannelBadge({
  channel,
  className,
  withIcon = false,
}: {
  channel: MessagingChannel
  className?: string
  withIcon?: boolean
}) {
  const style = STYLES[channel]
  if (!style) return null
  const { Icon } = style

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        style.className,
        className
      )}
    >
      {withIcon && <Icon className="h-3 w-3" />}
      {style.label}
    </span>
  )
}

export function channelLabel(channel: MessagingChannel): string {
  return STYLES[channel]?.label ?? channel
}
