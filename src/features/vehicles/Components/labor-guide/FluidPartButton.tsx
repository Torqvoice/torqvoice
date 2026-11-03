'use client'

import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { PricingSettings } from '@/features/inventory/Lib/partPricing'
import {
  type FluidPartLine,
  fluidLitres,
  fluidPartLine,
  matchStock,
  type StockPart,
} from '@/features/integrations/Lib/fluid-stock'
import type { FluidUnits } from '@/features/integrations/Lib/repair-prefs'
import type { FluidSpec } from '@/features/integrations/Lib/types'
import { cn } from '@/lib/utils'

/** The workshop's stock and how this page prices a pick from it. */
export interface LaborGuideStock {
  parts: readonly StockPart[]
  pricing?: PricingSettings
}

const LITRES_PER_QUART = 0.946353

interface FluidPartButtonProps {
  fluid: FluidSpec
  units: FluidUnits
  stock?: LaborGuideStock
  added: boolean
  onAdd: (line: FluidPartLine) => void
}

/**
 * Puts a fluid on the job as a part. When the workshop stocks something with
 * the same grade or spec, a short list offers it at the page's own price, in
 * the amount the service takes; otherwise one click adds a plain line with
 * the amount and no price, for the shop to price or swap for a stock item.
 */
export function FluidPartButton({ fluid, units, stock, added, onAdd }: FluidPartButtonProps) {
  const t = useTranslations('service.laborGuide')
  const tParts = useTranslations('service.parts')
  const format = useFormatter()
  const formatCurrency = useFormatCurrency()
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => matchStock(fluid, stock?.parts ?? []), [fluid, stock])
  const needed = fluidLitres(fluid)
  const num = (n: number) => format.number(n, { maximumFractionDigits: 2 })
  const amount = needed
    ? units === 'us'
      ? t('quarts', { value: num(needed.litres / LITRES_PER_QUART) })
      : t('liters', { value: num(needed.litres) })
    : null
  const qty = (line: FluidPartLine) =>
    line.unit ? `${num(line.quantity)} ${line.unit}` : num(line.quantity)

  const add = (part?: StockPart) => {
    onAdd(fluidPartLine(fluid, { units, part, pricing: stock?.pricing }))
    setOpen(false)
  }

  if (added)
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled
        className="h-8 gap-1.5 text-xs text-primary disabled:opacity-100"
      >
        <Check className="size-3.5" />
        {t('partAdded')}
      </Button>
    )

  if (matches.length === 0)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => add()}
        aria-label={t('addFluidAsPart', { system: fluid.system })}
        className="h-8 gap-1.5 text-xs"
      >
        <Plus className="size-3.5" />
        {t('addAsPart')}
      </Button>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('addFluidAsPart', { system: fluid.system })}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          {t('addAsPart')}
          <ChevronDown
            className={cn('size-3.5 opacity-60 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">{t('addFluidAsPart', { system: fluid.system })}</p>
          {needed && amount && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {needed.from === 'drainRefill'
                ? t('takesDrainRefill', { amount })
                : t('takesCapacity', { amount })}
            </p>
          )}
        </div>
        <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t('fromStock')}
        </p>
        <ul className="px-1.5 pb-1.5">
          {matches.map(({ part }) => {
            const line = fluidPartLine(fluid, { units, part, pricing: stock?.pricing })
            return (
              <li key={part.id}>
                <button
                  type="button"
                  onClick={() => add(part)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{part.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCurrency(line.unitPrice)}
                      {part.unit ? ` / ${part.unit}` : ''}
                      {' · '}
                      {part.quantity > 0
                        ? tParts('inStock', {
                            quantity: part.unit
                              ? `${num(part.quantity)} ${part.unit}`
                              : num(part.quantity),
                          })
                        : tParts('outOfStock')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums">{qty(line)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="border-t p-1.5">
          <button
            type="button"
            onClick={() => add()}
            className="w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t('addWithoutStock')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
