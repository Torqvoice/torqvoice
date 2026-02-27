'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import { formatCurrency, getCurrencySymbol } from '@/lib/format'
import { useTranslations } from 'next-intl'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import { makeEmptyLabor } from './form-types'

interface LaborEditorProps {
  laborItems: ServiceLaborInput[]
  setLaborItems: React.Dispatch<React.SetStateAction<ServiceLaborInput[]>>
  updateLabor: (index: number, field: keyof ServiceLaborInput, value: string | number) => void
  laborSubtotal: number
  currencyCode: string
  defaultLaborRate: number
}

export function LaborEditor({
  laborItems,
  setLaborItems,
  updateLabor,
  laborSubtotal,
  currencyCode,
  defaultLaborRate,
}: LaborEditorProps) {
  const t = useTranslations('service.labor')
  const cs = getCurrencySymbol(currencyCode)

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('addLabor')}
        </Button>
      </div>

      {laborItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t('description')}</span>
            <span>{t('hours')}</span>
            <span>{t('rate', { currency: cs })}</span>
            <span>{t('total')}</span>
            <span />
          </div>
          {laborItems.map((labor, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
            >
              <Textarea
                placeholder={t('descriptionPlaceholder')}
                value={labor.description}
                onChange={(e) => updateLabor(i, 'description', e.target.value)}
                rows={1}
                className="col-span-2 min-h-9 resize-none sm:col-span-1"
              />
              <Input
                type="number"
                min="0"
                step="any"
                value={labor.hours}
                onChange={(e) => updateLabor(i, 'hours', e.target.value)}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={labor.rate}
                onChange={(e) => updateLabor(i, 'rate', e.target.value)}
              />
              <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
                {formatCurrency(labor.total, currencyCode)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => setLaborItems((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])}
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex justify-end pt-1 text-sm">
            <span className="font-medium">
              {t('subtotal', { amount: formatCurrency(laborSubtotal, currencyCode) })}
            </span>
          </div>
        </>
      )}

      {laborItems.length === 0 && (
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
          onClick={() => setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])}
        >
          <Plus className="mr-1 h-4 w-4" />
          <span className="text-sm">{t('addLabor')}</span>
        </button>
      )}
    </div>
  )
}
