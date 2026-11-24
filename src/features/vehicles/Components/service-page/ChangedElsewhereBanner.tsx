'use client'

import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useServiceType } from '@/components/service-type-context'
import type { WorkOrderField } from '@/features/vehicles/Lib/workOrderFields'

/**
 * A field this page had changed was saved somewhere else too: the same job in
 * another tab, or a colleague's screen. Each save sends only the fields it
 * changed, so the later one wins, and this says which page that was.
 *
 * - `kept`: still being edited here. This page's version is the later one,
 *   and its save replaces the other.
 * - `replaced`: this page had saved it, and a later save elsewhere replaced
 *   that. The page now shows the newer version.
 *
 * Drawn like the banner for lines added elsewhere (LaborAddedBanner).
 */
export function ChangedElsewhereBanner({
  kept,
  replaced,
  onDismiss,
}: {
  kept: WorkOrderField[]
  replaced: WorkOrderField[]
  onDismiss: () => void
}) {
  const t = useTranslations('service.changedElsewhere')
  const marine = useServiceType() === 'marine'
  if (kept.length === 0 && replaced.length === 0) return null

  const names = (fields: WorkOrderField[]) =>
    fields
      .map((field) => t(`fields.${field === 'mileage' && marine ? 'mileageMarine' : field}`))
      .join(', ')

  return (
    <div
      data-testid="changed-elsewhere-banner"
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/10 px-4 py-2"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        {replaced.length > 0 && (
          <p>
            <span className="font-medium">{t('replacedTitle', { fields: names(replaced) })}</span>{' '}
            <span className="text-muted-foreground">{t('replacedBody')}</span>
          </p>
        )}
        {kept.length > 0 && (
          <p>
            <span className="font-medium">{t('keptTitle', { fields: names(kept) })}</span>{' '}
            <span className="text-muted-foreground">{t('keptBody')}</span>
          </p>
        )}
      </div>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={onDismiss}>
        {t('dismiss')}
      </Button>
    </div>
  )
}
