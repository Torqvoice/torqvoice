'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/format'

interface TotalsSectionProps {
  partsSubtotal: number
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
  totalAmount: number
  currencyCode: string
}

export function TotalsSection({
  partsSubtotal,
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
  totalAmount,
  currencyCode,
}: TotalsSectionProps) {
  const t = useTranslations('service.totals')
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('parts')}</span>
          <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('labor')}</span>
          <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('subtotal')}</span>
          <span className="font-medium">{formatCurrency(subtotal, currencyCode)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('discount')}</span>
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('discountNone')}</SelectItem>
                <SelectItem value="percentage">{t('discountPercentage')}</SelectItem>
                <SelectItem value="fixed">{t('discountFixed')}</SelectItem>
              </SelectContent>
            </Select>
            {discountType !== 'none' && (
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value === "" ? 0 : Number(e.target.value))}
                className="h-7 w-20 text-right text-xs"
              />
            )}
            {discountType === 'percentage' && (
              <span className="text-muted-foreground">%</span>
            )}
          </div>
          {discountAmount > 0 && (
            <span className="text-destructive">
              {formatCurrency(-discountAmount, currencyCode)}
            </span>
          )}
        </div>

        {taxEnabled && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('tax')}</span>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value === "" ? 0 : Number(e.target.value))}
                className="h-7 w-20 text-right text-xs"
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <span>{formatCurrency(taxAmount, currencyCode)}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
          <span>{t('total')}</span>
          <span>{formatCurrency(totalAmount, currencyCode)}</span>
        </div>
      </div>
    </div>
  )
}
