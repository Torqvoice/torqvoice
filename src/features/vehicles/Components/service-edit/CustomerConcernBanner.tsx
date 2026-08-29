'use client'

import { useTranslations } from 'next-intl'
import { MessageSquareQuote } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * What the customer said, at the top of the working column.
 *
 * This started life in the customer card in the sidebar, which was the wrong
 * place twice over. That column is narrow, it is where the invoice lives, and
 * it is the half of the screen a technician scrolls past. The reason the car
 * is here should be the first thing anybody reads on the job, so it sits above
 * the work itself, the same way the tire banner does.
 *
 * Not in the notes section either: notes are the shop writing about its own
 * work, and this is the one line on the job that belongs to somebody else.
 * It is quoted rather than typed as prose for exactly that reason.
 */
export function CustomerConcernBanner({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('service.basicInfo')

  return (
    <div className="rounded-lg border border-l-4 border-l-primary/60 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="customerConcern" className="text-sm font-semibold">
          {t('customerConcern')}
        </Label>
      </div>
      <Textarea
        id="customerConcern"
        name="customerConcern"
        rows={2}
        placeholder={t('customerConcernPlaceholder')}
        defaultValue={defaultValue}
        className="resize-none italic"
      />
      <p className="text-muted-foreground text-xs">{t('customerConcernHint')}</p>
    </div>
  )
}
