'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'

const DISMISSED_KEY = 'torqvoice:workOrderLayoutHintDismissed'

/**
 * The invitation on the classic work order page. Nobody is moved to the
 * overhauled page without asking for it, so this is how they find out it
 * exists. Closing it is remembered in this browser; the way in stays in the
 * page's "more" menu for whoever changes their mind.
 *
 * Drawn only after mount: whether it was dismissed is in localStorage, which
 * the server cannot see, and a banner that renders and then vanishes on
 * hydration would shift the whole form down and back.
 */
export function TryNewLayoutBanner({ onTry }: { onTry: () => void }) {
  const t = useTranslations('service.modern.invite')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISSED_KEY) !== 'true')
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    // Closed without trying it: the other half of how well the invitation works.
    track('work_order:layout_invite_dismiss')
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Private mode: it comes back next visit, which is no harm.
    }
  }

  return (
    <div
      data-testid="try-new-layout"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/10 px-4 py-2"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{t('title')}</span>{' '}
        <span className="text-muted-foreground">{t('body')}</span>
      </p>
      <Button type="button" size="sm" className="h-8" onClick={onTry}>
        {t('try')}
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss')}
        className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
