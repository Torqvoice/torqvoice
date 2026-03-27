'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Layers, Plus, Trash2, Wrench } from 'lucide-react'
import { formatCurrency, getCurrencySymbol } from '@/lib/format'
import { useTranslations } from 'next-intl'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import { makeEmptyLabor, makeEmptyService } from './form-types'

interface LaborEditorProps {
  laborItems: ServiceLaborInput[]
  setLaborItems: React.Dispatch<React.SetStateAction<ServiceLaborInput[]>>
  updateLabor: (index: number, field: keyof ServiceLaborInput, value: string | number) => void
  laborSubtotal: number
  currencyCode: string
  defaultLaborRate: number
  hasPresets?: boolean
  onOpenPresets?: () => void
}

export function LaborEditor({
  laborItems,
  setLaborItems,
  updateLabor,
  laborSubtotal,
  currencyCode,
  defaultLaborRate,
  hasPresets,
  onOpenPresets,
}: LaborEditorProps) {
  const t = useTranslations('service.labor')
  const cs = getCurrencySymbol(currencyCode)

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {hasPresets && onOpenPresets && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenPresets}>
              <Layers className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('fromPresets')}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('addLabor')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLaborItems((prev) => [...prev, makeEmptyService()])}
          >
            <Wrench className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('addService')}</span>
          </Button>
        </div>
      </div>

      {laborItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t('description')}</span>
            <span>{t('qtyOrHours')}</span>
            <span>{t('rate', { currency: cs })}</span>
            <span>{t('total')}</span>
            <span />
          </div>
          {laborItems.map((labor, i) => {
            const isService = labor.pricingType === 'service'
            return (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <div className="col-span-2 flex gap-2 sm:col-span-1">
                  <Textarea
                    placeholder={t('descriptionPlaceholder')}
                    value={labor.description}
                    onChange={(e) => updateLabor(i, 'description', e.target.value)}
                    rows={1}
                    className="min-h-9 flex-1 resize-none"
                  />
                  <button
                    type="button"
                    className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-all ${
                      isService
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 hover:border-blue-500/50'
                        : 'border-muted text-muted-foreground hover:bg-muted hover:text-foreground hover:border-foreground/20'
                    }`}
                    onClick={() => updateLabor(i, 'pricingType', isService ? 'hourly' : 'service')}
                    title={isService ? t('switchToHourlyHint') : t('switchToServiceHint')}
                  >
                    {isService ? t('serviceTag') : t('hourlyTag')}
                  </button>
                </div>
                <Input
                  type="number"
                  min="0"
                  step={isService ? '1' : 'any'}
                  placeholder={isService ? t('qty') : t('hours')}
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
            )
          })}
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
        <div className="flex gap-2">
          <button
            type="button"
            className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])}
          >
            <Plus className="mr-1 h-4 w-4" />
            <span className="text-sm">{t('addLabor')}</span>
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setLaborItems((prev) => [...prev, makeEmptyService()])}
          >
            <Wrench className="mr-1 h-4 w-4" />
            <span className="text-sm">{t('addService')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
