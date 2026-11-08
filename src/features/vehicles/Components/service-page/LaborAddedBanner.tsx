'use client'

import { useTranslations } from 'next-intl'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * A technician billed time or scanned a part from the app while this work
 * order was open, and the page is mid-edit, so the lines are waiting rather
 * than appearing under someone's cursor. Taking the offer puts them in the
 * lists with everything else; ignoring it costs nothing, because the next save
 * writes them either way (see laborAddedElsewhere and partsAddedElsewhere in
 * useServiceFormState).
 *
 * With nothing being edited no banner is shown at all: the lines are simply
 * in the lists, the way they would be after a reload.
 */
export function LaborAddedBanner({
  count,
  parts = 0,
  onShow,
}: {
  /** Labour lines waiting. */
  count: number
  /** Parts waiting. */
  parts?: number
  onShow: () => void
}) {
  const t = useTranslations('service.liveLabor')
  if (count === 0 && parts === 0) return null

  const title =
    count > 0 && parts > 0
      ? t('titleBoth')
      : parts > 0
        ? t('titleParts', { count: parts })
        : t('title', { count })

  return (
    <div
      data-testid="labor-added-banner"
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/10 px-4 py-2"
    >
      <Wrench className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{title}</span>{' '}
        <span className="text-muted-foreground">{t('body')}</span>
      </p>
      <Button type="button" size="sm" className="h-8" onClick={onShow}>
        {t('show')}
      </Button>
    </div>
  )
}
