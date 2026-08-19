'use client'

import { useTranslations } from 'next-intl'
import { Droplets, Gauge, Hammer, Scale, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { applicableTreatments, type TreatmentType } from '../Lib/treatments'

export const TREATMENT_ICON_MAP: Record<TreatmentType, LucideIcon> = {
  wash_tires: Droplets,
  wash_rims: Sparkles,
  balance: Scale,
  tpms_service: Gauge,
  new_valves: Wrench,
  repair: Hammer,
}

/**
 * Choosing the prep work a set needs.
 *
 * Toggle tiles rather than a column of checkboxes: the whole point is that
 * someone at a counter can set this in two taps and read it back at a glance,
 * and a tile carries its icon, its name and its state in one target big
 * enough to hit with gloves on.
 */
export function TreatmentPicker({
  selected,
  onChange,
  withRims,
  hasTpms,
  className,
}: {
  selected: TreatmentType[]
  onChange: (types: TreatmentType[]) => void
  withRims: boolean
  hasTpms: boolean
  className?: string
}) {
  const t = useTranslations('tireHotel')
  const available = applicableTreatments({ withRims, hasTpms })

  const toggle = (type: TreatmentType) => {
    onChange(selected.includes(type) ? selected.filter((x) => x !== type) : [...selected, type])
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
      {available.map((type) => {
        const Icon = TREATMENT_ICON_MAP[type]
        const isOn = selected.includes(type)
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            aria-pressed={isOn}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isOn
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted/60'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', isOn && 'text-primary')} />
            <span className="min-w-0 truncate">{t(`treatments.types.${type}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
