'use client'

import { useTranslations } from 'next-intl'
import { Separator } from '@/components/ui/separator'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { taxDisplay, type TaxComponent } from '@/lib/tax'
import type { TaxableShare } from '@/lib/taxable-lines'
import { taxComponentLabel } from '@/lib/tax-components'

interface InvoiceSummaryProps {
  hasPartItems: boolean
  hasLaborItems: boolean
  partsSubtotal: number
  laborSubtotal: number
  subtotal: number
  discountAmount: number
  discountType: string | null
  discountValue: number
  taxRate: number
  taxAmount: number
  taxInclusive: boolean
  taxComponents?: TaxComponent[] | null
  /** Set when some lines are left out of the tax; adds the "Taxable amount" row. */
  taxableShare?: TaxableShare | null
  displayTotal: number
  totalPaid: number
  balanceDue: number
  hasPayments: boolean
  currencyCode: string
}

export function InvoiceSummary({
  hasPartItems,
  hasLaborItems,
  partsSubtotal,
  laborSubtotal,
  subtotal,
  discountAmount,
  discountType,
  discountValue,
  taxRate,
  taxAmount,
  taxInclusive,
  taxComponents,
  taxableShare = null,
  displayTotal,
  totalPaid,
  balanceDue,
  hasPayments,
  currencyCode,
}: InvoiceSummaryProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('service.invoice')

  // Universal display: net per category, net subtotal, net discount, tax, gross total.
  // No-op for exclusive records; back-calculates the net portions for inclusive records.
  // A line left out of the tax holds none, so only the taxable part of each
  // figure is taken net; with every line taxed that is the whole figure.
  const display = taxDisplay({ taxRate, taxInclusive })
  const displayPartsSubtotal = display.mixed(partsSubtotal, taxableShare?.parts)
  const displayLaborSubtotal = display.mixed(laborSubtotal, taxableShare?.labor)
  const displaySubtotal = display.mixed(subtotal, taxableShare?.subtotal)
  const displayDiscountAmount = display.discount(discountAmount, subtotal, taxableShare?.subtotal)

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-semibold">{t('title')}</h3>
      <div className="space-y-1.5">
        {hasPartItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('parts')}</span>
            <span>{formatCurrency(displayPartsSubtotal, currencyCode)}</span>
          </div>
        )}
        {hasLaborItems && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('labor')}</span>
            <span>{formatCurrency(displayLaborSubtotal, currencyCode)}</span>
          </div>
        )}
        {displaySubtotal > 0 &&
          ((hasPartItems && hasLaborItems) || displayDiscountAmount > 0 || taxRate > 0) && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('subtotal')}</span>
              <span>{formatCurrency(displaySubtotal, currencyCode)}</span>
            </div>
          )}
        {displayDiscountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t('discount')}
              {discountType === 'percentage' ? ` (${discountValue}%)` : ''}
            </span>
            <span className="text-destructive">
              {formatCurrency(-displayDiscountAmount, currencyCode)}
            </span>
          </div>
        )}
        {taxableShare && taxRate > 0 && (
          <div className="flex justify-between text-sm" data-testid="taxable-amount-row">
            <span className="text-muted-foreground">{t('taxableAmount')}</span>
            <span>{formatCurrency(taxableShare.taxableAmount, currencyCode)}</span>
          </div>
        )}
        {taxComponents && taxComponents.length > 0 ? (
          taxComponents.map((component) => (
            <div key={component.name} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{taxComponentLabel(component)}</span>
              <span>{formatCurrency(component.amount, currencyCode)}</span>
            </div>
          ))
        ) : taxRate > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('tax', { rate: taxRate })}</span>
            <span>{formatCurrency(taxAmount, currencyCode)}</span>
          </div>
        ) : null}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>{t('total')}</span>
          <span>{formatCurrency(displayTotal, currencyCode)}</span>
        </div>
        {hasPayments && (
          <>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>{t('paid')}</span>
              <span>{formatCurrency(-totalPaid, currencyCode)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>{t('balanceDue')}</span>
              <span className={balanceDue <= 0 ? 'text-emerald-600' : ''}>
                {balanceDue <= 0 ? t('paidBadge') : formatCurrency(balanceDue, currencyCode)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
