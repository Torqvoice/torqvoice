'use client'

import { useTranslations } from 'next-intl'
import { CreditCard, Eye, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { cn } from '@/lib/utils'

interface MoneyBarProps {
  total: number
  paid: number
  balance: number
  currencyCode: string
  onTakePayment: () => void
  onPreview: () => void
  onSend: () => void
}

/**
 * The job's money, and what is usually done about it, along the bottom of the
 * overhauled page. The figure everybody checks while adding parts and labour
 * sits in a card far down the side column; this keeps it on screen wherever
 * the page is scrolled to, with the three things that follow from it: take a
 * payment, look at the invoice, send it.
 *
 * It lives outside the work order form and its fieldset, so it works on a
 * locked invoice, which is exactly the one that gets paid and sent again.
 * Drawn from `lg` up only: a phone or tablet has too little height to give a
 * strip of it away, and everything on the bar is on the page as well.
 */
export function MoneyBar({
  total,
  paid,
  balance,
  currencyCode,
  onTakePayment,
  onPreview,
  onSend,
}: MoneyBarProps) {
  const t = useTranslations('service.modern.moneyBar')
  const formatCurrency = useFormatCurrency()
  const settled = total > 0 && balance <= 0

  return (
    <div
      data-testid="money-bar"
      // Desktop only. On a phone or tablet it took a strip of a small screen
      // for things the page already has: the totals and "Record payment" in
      // the invoice card, preview and send in the header.
      className="hidden shrink-0 border-t bg-background/95 backdrop-blur lg:block"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <dl className="flex min-w-0 flex-1 items-baseline gap-x-5 gap-y-1">
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <dt className="text-xs text-muted-foreground">{t('total')}</dt>
            <dd className="font-mono text-sm tabular-nums" data-testid="money-total">
              {formatCurrency(total, currencyCode)}
            </dd>
          </div>
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <dt className="text-xs text-muted-foreground">{t('paid')}</dt>
            <dd className="font-mono text-sm tabular-nums" data-testid="money-paid">
              {formatCurrency(paid, currencyCode)}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {settled ? t('settled') : t('balance')}
            </dt>
            <dd
              data-testid="money-balance"
              className={cn(
                'order-number text-xl font-bold leading-none tabular-nums',
                settled && 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {formatCurrency(balance, currencyCode)}
            </dd>
          </div>
        </dl>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={settled ? 'outline' : 'default'}
            onClick={onTakePayment}
          >
            <CreditCard className="mr-1.5 h-4 w-4" />
            {t('takePayment')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onPreview}>
            <Eye className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">{t('preview')}</span>
            <span className="sm:hidden">{t('previewShort')}</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onSend}>
            <Globe className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">{t('send')}</span>
            <span className="sm:hidden">{t('sendShort')}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
