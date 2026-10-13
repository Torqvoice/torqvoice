'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { useCurrencySettings, useFormatCurrency } from '@/components/currency-settings-context'
import { getCurrencySymbol } from '@/lib/format'
import { cn } from '@/lib/utils'
import { taxDisplay, type TaxComponent } from '@/lib/tax'
import type { TaxableShare } from '@/lib/taxable-lines'
import { taxComponentLabel } from '@/lib/tax-components'
import { useModernWorkOrder } from '@/components/work-order-layout-context'
import { WorkshopTaxOfferPrompt } from '@/features/settings/Components/WorkshopTaxOffer'

interface TotalsSectionProps {
  partsSubtotal: number
  /** Internal pre-markup parts cost; rendered muted, never on PDF/share */
  partsCostSubtotal: number
  laborSubtotal: number
  subtotal: number
  discountType: string
  setDiscountType: (type: string) => void
  discountValue: number
  setDiscountValue: (value: number) => void
  discountAmount: number
  taxEnabled: boolean
  taxRate: number
  setTaxRate: (rate: number) => void
  taxAmount: number
  taxInclusive: boolean
  /** One row per tax when the job splits its tax; the rate is then not editable here. */
  taxComponents?: TaxComponent[] | null
  /** Set when some lines are left out of the tax; adds the "Taxable amount" row. */
  taxableShare?: TaxableShare | null
  totalAmount: number
  currencyCode: string
}

/**
 * One row of the card: a label, a control where the figure can be changed,
 * and the amount. The three sit in columns shared by every row (a subgrid),
 * so the controls end on one edge and the amounts on another, whatever each
 * label's length. Before this each control sat wherever its label ended.
 *
 * Declared at module level on purpose: a component created inside the card's
 * render would be a new type on every keystroke, and React would remount the
 * field being typed in.
 */
function Row({
  label,
  control,
  amount,
  className,
  testId,
}: {
  label: React.ReactNode
  control?: React.ReactNode
  amount?: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      data-totals-row
      data-testid={testId}
      className={cn('col-span-3 grid grid-cols-subgrid items-center text-sm', className)}
    >
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="flex items-center justify-end gap-1.5">{control}</span>
      <span className="text-right tabular-nums">{amount}</span>
    </div>
  )
}

export function TotalsSection({
  partsSubtotal,
  partsCostSubtotal,
  laborSubtotal,
  subtotal,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  discountAmount,
  taxEnabled,
  taxRate,
  setTaxRate,
  taxAmount,
  taxInclusive,
  taxComponents,
  taxableShare = null,
  totalAmount,
  currencyCode,
}: TotalsSectionProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('service.totals')
  const modern = useModernWorkOrder()
  const { currencyFormat } = useCurrencySettings()
  const currencySymbol = getCurrencySymbol(currencyCode, currencyFormat)

  // Universal display: net per category, net subtotal, net discount, tax, gross total.
  // Matches the invoice/PDF/share view exactly so the user always sees how the
  // tax breaks down — even when they're entering prices in inclusive mode.
  // A line left out of the tax holds none, so only the taxable part of each
  // figure is taken net; with every line taxed that is the whole figure.
  const display = taxDisplay({ taxRate, taxInclusive })
  const displayPartsSubtotal = display.mixed(partsSubtotal, taxableShare?.parts)
  const displayLaborSubtotal = display.mixed(laborSubtotal, taxableShare?.labor)
  const displaySubtotal = display.mixed(subtotal, taxableShare?.subtotal)
  const displayDiscountAmount = display.discount(discountAmount, subtotal, taxableShare?.subtotal)

  /** A number field with its unit inside the box, so every field is the same width. */
  const unitField = (
    value: number,
    onChange: (value: number) => void,
    unit: string,
    step: string,
    label: string,
    /** Shown greyed out and out of reach: not focusable, not editable. */
    inert = false
  ) => (
    <span className="relative inline-block">
      <Input
        type="number"
        min="0"
        step={step}
        value={value}
        aria-label={label}
        disabled={inert}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="h-7 w-20 pr-7 text-right text-xs"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
        {unit}
      </span>
    </span>
  )

  const discountKinds = [
    { value: 'none', short: t('discountOff'), name: t('discountNone') },
    { value: 'percentage', short: '%', name: t('discountPercentage') },
    { value: 'fixed', short: currencySymbol, name: t('discountFixed') },
  ]

  const rows = (
    <div className="space-y-2" data-testid="totals">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2">
        <Row label={t('parts')} amount={formatCurrency(displayPartsSubtotal, currencyCode)} />
        {partsCostSubtotal > 0 && (
          <Row
            className="text-xs text-muted-foreground/70 [&>span]:text-muted-foreground/70"
            label={t('partsCost')}
            amount={formatCurrency(partsCostSubtotal, currencyCode)}
          />
        )}
        <Row label={t('labor')} amount={formatCurrency(displayLaborSubtotal, currencyCode)} />
        <Row
          className="border-t pt-2"
          label={t('subtotal')}
          amount={
            <span className="font-medium">{formatCurrency(displaySubtotal, currencyCode)}</span>
          }
        />

        <Row
          label={t('discount')}
          control={
            <>
              {/* Off, a percentage or an amount: one click, where the dropdown took two. */}
              <span
                role="radiogroup"
                aria-label={t('discount')}
                className="inline-flex h-7 overflow-hidden rounded-md border bg-background text-xs"
              >
                {discountKinds.map((kind, index) => (
                  <button
                    key={kind.value}
                    type="button"
                    role="radio"
                    aria-checked={discountType === kind.value}
                    aria-label={kind.name}
                    title={kind.name}
                    onClick={() => setDiscountType(kind.value)}
                    className={cn(
                      'px-2 transition-colors',
                      index > 0 && 'border-l',
                      discountType === kind.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {kind.short}
                  </button>
                ))}
              </span>
              {/* Always in the row, greyed out while the discount is off:
                  the switch beside it must not move when a kind is chosen. */}
              {unitField(
                discountValue,
                setDiscountValue,
                discountType === 'fixed' ? currencySymbol : '%',
                '0.01',
                t('discount'),
                discountType === 'none'
              )}
            </>
          }
          amount={
            displayDiscountAmount > 0 ? (
              <span className="text-destructive">
                {formatCurrency(-displayDiscountAmount, currencyCode)}
              </span>
            ) : null
          }
        />

        {taxEnabled && taxableShare && taxRate > 0 && (
          // The tax is a percentage of this row, not of the subtotal, once a
          // line is left out of it; without the row the card would not add up.
          <Row
            testId="taxable-amount-row"
            label={t('taxableAmount')}
            amount={formatCurrency(taxableShare.taxableAmount, currencyCode)}
          />
        )}

        {taxEnabled && taxComponents && taxComponents.length > 0 ? (
          // A split tax is the workshop's, set once in settings: each part
          // gets its own line here, as it does on the invoice, and the
          // rate is not a field on the job.
          taxComponents.map((component) => (
            <Row
              key={component.name}
              testId="tax-component-row"
              label={taxComponentLabel(component)}
              amount={formatCurrency(component.amount, currencyCode)}
            />
          ))
        ) : taxEnabled ? (
          <Row
            label={t('tax')}
            control={unitField(taxRate, setTaxRate, '%', '0.1', t('tax'))}
            amount={formatCurrency(taxAmount, currencyCode)}
          />
        ) : null}
      </div>

      <WorkshopTaxOfferPrompt />

      <div
        data-totals-row
        className="flex items-center justify-between border-t pt-2 text-lg font-bold tabular-nums"
      >
        <span>{t('total')}</span>
        <span>{formatCurrency(totalAmount, currencyCode)}</span>
      </div>
      {taxInclusive && (
        <p className="text-xs text-muted-foreground italic">{t('inclusiveModeHint')}</p>
      )}
    </div>
  )

  // Inside the overhauled page's invoice card the rows stand on their own.
  if (modern) return rows

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      {rows}
    </div>
  )
}
