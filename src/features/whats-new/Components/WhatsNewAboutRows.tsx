'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useWhatsNew } from './WhatsNewProvider'

/**
 * The "What's new" rows on Settings, About: a button that opens the panel,
 * and the switch for the tab on the edge of the screen, which is where
 * somebody who hid the tab comes to get it back. Nothing is drawn when there
 * is no news to open, because there is no tab to switch either.
 */
export function WhatsNewAboutRows() {
  const t = useTranslations('settings.about')
  const switchId = useId()
  const { available, open, tabHidden, setTabHidden } = useWhatsNew()
  if (!available) return null
  return (
    <>
      <div id="about-whats-new" className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">{t('whatsNew')}</span>
        <Button type="button" variant="outline" size="sm" onClick={open}>
          {t('whatsNewOpen')}
        </Button>
      </div>
      <div className="hidden items-center justify-between gap-4 md:flex">
        <label htmlFor={switchId} className="flex flex-col text-sm text-muted-foreground">
          {t('whatsNewTab')}
          <span className="text-xs">{t('whatsNewTabHint')}</span>
        </label>
        <Switch
          id={switchId}
          checked={!tabHidden}
          onCheckedChange={(checked) => setTabHidden(!checked)}
        />
      </div>
    </>
  )
}
