'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  SUPPORT_OPEN_EVENT,
  SUPPORT_VISIBILITY_EVENT,
  isSupportBubbleHidden,
  setSupportBubbleHidden,
} from '@/features/support/Lib/supportVisibility'

/**
 * The way back for someone who dismissed the button. Reads and writes the same
 * localStorage key the widget does, and both listen for the shared event so
 * the toggle and the button never disagree.
 */
export function SupportSettingsControls() {
  const t = useTranslations('settings')
  const [visible, setVisible] = useState(true)
  // Rendered on the server first, so the stored preference is unknown until
  // mount. Without this the switch flips visibly on load.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => setVisible(!isSupportBubbleHidden())
    sync()
    setReady(true)
    window.addEventListener(SUPPORT_VISIBILITY_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SUPPORT_VISIBILITY_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="support-visible">{t('support.showButton')}</Label>
          <p className="text-xs text-muted-foreground">{t('support.showButtonHint')}</p>
        </div>
        <Switch
          id="support-visible"
          checked={visible}
          disabled={!ready}
          onCheckedChange={(checked) => {
            setVisible(checked)
            setSupportBubbleHidden(!checked)
          }}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label>{t('support.contactTitle')}</Label>
          <p className="text-xs text-muted-foreground">{t('support.contactHint')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            // Opening while hidden would dispatch into nothing, so make it
            // visible first and let the widget mount before asking it to open.
            if (isSupportBubbleHidden()) {
              setSupportBubbleHidden(false)
              setVisible(true)
            }
            requestAnimationFrame(() => window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT)))
          }}
        >
          {t('support.contactAction')}
        </Button>
      </div>
    </div>
  )
}
