'use client'

import { Megaphone, PanelRightOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useWhatsNew } from './WhatsNewProvider'

/**
 * "What's new" in the account menu: the link that is there on every screen
 * size, with or without the tab, and under it the way to bring a hidden tab
 * back. Renders nothing when there is no news to open.
 */
export function WhatsNewMenuItem() {
  const t = useTranslations('common.whatsNew')
  const tAbout = useTranslations('settings.about')
  const { available, hasUnread, open, tabHidden, setTabHidden } = useWhatsNew()
  if (!available) return null
  return (
    <>
      <DropdownMenuItem onClick={() => open('menu')}>
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
      {/* The way back for somebody who hid the tab and whose role cannot
          open Settings, where the switch for it is. Larger screens only,
          like the tab itself. */}
      {tabHidden && (
        <DropdownMenuItem className="hidden md:flex" onClick={() => setTabHidden(false)}>
          <PanelRightOpen className="mr-2 size-4 shrink-0" />
          {tAbout('whatsNewTab')}
        </DropdownMenuItem>
      )}
    </>
  )
}
