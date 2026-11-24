'use client'

import { useTranslations } from 'next-intl'
import { Ban } from 'lucide-react'

/**
 * Says the job's invoice was cancelled, in the place the lock banner takes
 * on a locked invoice: nothing on the page can change it any more, and the
 * number is kept so the numbering has no gap.
 */
export function CancelledInvoiceBanner({ invoiceNumber }: { invoiceNumber: string | null }) {
  const t = useTranslations('service.cancelInvoice')
  return (
    <div
      role="status"
      data-testid="cancelled-invoice-banner"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">
          {invoiceNumber ? t('bannerTitle', { number: invoiceNumber }) : t('bannerTitleNoNumber')}
        </p>
        <p className="text-xs text-muted-foreground">{t('bannerBody')}</p>
      </div>
    </div>
  )
}
