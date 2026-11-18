'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * The way into the "What's new" panel: a tab on the right edge of the
 * screen, written sideways, where the panel itself comes out from.
 *
 * A word, not an icon. An icon in the header went unnoticed, because nothing
 * about it said what it was; a tab that says "What's new" needs no learning.
 * It is always there, loud while something is unseen and quiet once it has
 * been read, and it carries its own way out for people who would rather not
 * have it. Desktop only: on a phone the edge of the screen is the edge of
 * the content, and the account menu has the same link.
 */
export function WhatsNewTab({
  hasUnread,
  onOpen,
  onHide,
}: {
  hasUnread: boolean
  onOpen: () => void
  onHide: () => void
}) {
  const t = useTranslations('common.whatsNew')
  return (
    <div
      className={cn(
        'fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center overflow-hidden rounded-l-lg border border-r-0 shadow-md md:flex print:hidden',
        hasUnread
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-foreground/80'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={hasUnread ? t('openUnread') : t('title')}
        className={cn(
          'flex cursor-pointer items-center gap-2.5 px-2 pb-3.5 pt-4 text-[13px] font-semibold tracking-wide transition-colors [writing-mode:vertical-rl] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          hasUnread ? 'hover:bg-primary-foreground/10' : 'hover:bg-muted hover:text-foreground'
        )}
      >
        {hasUnread && (
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/70 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
          </span>
        )}
        {/* Read from the bottom up, the way a label on a spine is. */}
        <span className="rotate-180">{t('title')}</span>
      </button>
      <button
        type="button"
        onClick={onHide}
        aria-label={t('hideTab')}
        title={t('hideTab')}
        className={cn(
          'flex h-7 w-full cursor-pointer items-center justify-center border-t transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          hasUnread
            ? 'border-primary-foreground/25 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground'
            : 'hover:bg-muted hover:text-foreground'
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
