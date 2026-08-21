'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WhatsappConversation, type WhatsappThread } from './WhatsappConversation'

export interface WhatsappThreadSummary extends WhatsappThread {
  lastMessage: string
  lastDirection: string
  lastAt: string | Date
}

/**
 * The inbox: conversations on the left, the open one on the right.
 *
 * Below md the two panes swap rather than shrink, because a phone in a
 * workshop shows one thing at a time and a squeezed thread list is unusable
 * with a glove on.
 */
export function WhatsappMessagesClient({ threads }: { threads: WhatsappThreadSummary[] }) {
  const t = useTranslations('whatsapp.messages')
  const [activeKey, setActiveKey] = useState<string | null>(threads[0]?.key ?? null)

  const active = threads.find((thread) => thread.key === activeKey) ?? null

  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{t('noThreads')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('noThreadsHint')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          'w-full shrink-0 overflow-y-auto border-r md:block md:w-80',
          active && 'hidden md:block'
        )}
      >
        {threads.map((thread) => (
          <button
            key={thread.key}
            type="button"
            onClick={() => setActiveKey(thread.key)}
            className={cn(
              'flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
              thread.key === activeKey && 'bg-accent'
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{thread.name}</span>
              {thread.lastDirection === 'inbound' && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">{thread.lastMessage}</span>
          </button>
        ))}
      </aside>

      <section className={cn('flex-1', !active && 'hidden md:block')}>
        {active ? (
          <>
            <div className="border-b p-2 md:hidden">
              <Button type="button" variant="ghost" size="sm" onClick={() => setActiveKey(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('backToThreads')}
              </Button>
            </div>
            <WhatsappConversation key={active.key} thread={active} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            {t('selectThread')}
          </div>
        )}
      </section>
    </div>
  )
}
