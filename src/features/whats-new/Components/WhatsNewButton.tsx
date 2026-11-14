'use client'

import { Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useWhatsNew } from './WhatsNewProvider'

/**
 * The header's way into the "What's new" panel.
 *
 * A dot, not a number: the count pills in the sidebar mean work waiting on
 * somebody, and three unread announcements are not that. Renders nothing when
 * there is no news to open, so the header never offers an empty panel.
 */
export function WhatsNewButton() {
  const t = useTranslations('common.whatsNew')
  const { available, hasUnread, open } = useWhatsNew()
  if (!available) return null

  const label = hasUnread ? t('openUnread') : t('title')
  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Gift className="h-4 w-4" />
      {hasUnread && (
        <span
          aria-hidden
          className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </button>
  )
}
