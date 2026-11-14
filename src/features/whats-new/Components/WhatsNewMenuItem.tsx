'use client'

import { Megaphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useWhatsNew } from './WhatsNewProvider'

/**
 * "What's new" in the account menu: the link that is there on every screen
 * size, with or without the tab. Renders nothing when there is no news to
 * open.
 */
export function WhatsNewMenuItem() {
  const t = useTranslations('common.whatsNew')
  const { available, hasUnread, open } = useWhatsNew()
  if (!available) return null
  return (
    <DropdownMenuItem onClick={open}>
      <Megaphone className="mr-2 size-4" />
      {t('title')}
      {hasUnread && (
        <span
          role="img"
          aria-label={t('unread')}
          className="ml-auto size-2 rounded-full bg-primary"
        />
      )}
    </DropdownMenuItem>
  )
}
