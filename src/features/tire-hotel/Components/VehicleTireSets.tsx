'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ChevronRight, Disc3, MapPin } from 'lucide-react'
import { CONDITION_TOKENS, worstCondition, type TireCondition } from '../Lib/tireConstants'
import { pendingTreatments } from '../Lib/treatments'

export type VehicleTireSet = {
  id: string
  reference: string | null
  season: string
  size: string | null
  quantity: number
  status: string
  location: { code: string } | null
  measurements: { condition: string }[]
  treatments: { type: string; status: string }[]
}

/**
 * Tires this vehicle has in storage, on the vehicle page.
 *
 * One line per set and nothing more. Someone opening a vehicle is usually
 * after its service history, so this answers the tire question in passing
 * rather than claiming a panel: is anything here, where is it, and is
 * anything wrong with it.
 *
 * Renders nothing when the vehicle has no stored tires, which is most of
 * them. An empty state here would be a permanent row saying "no" on every
 * vehicle in the shop.
 */
export function VehicleTireSets({ sets }: { sets: VehicleTireSet[] }) {
  const t = useTranslations('tireHotel')
  if (sets.length === 0) return null

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Disc3 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">{t('vehicle.title')}</span>
        <span className="text-xs text-muted-foreground">
          {t('vehicle.count', { count: sets.length })}
        </span>
      </div>

      <ul className="space-y-0.5">
        {sets.map((set) => {
          const grade =
            set.measurements.length > 0
              ? worstCondition(set.measurements.map((m) => m.condition))
              : null
          const outstanding = pendingTreatments(set.treatments).length
          const stored = set.status === 'stored'

          return (
            <li key={set.id}>
              <Link
                href={`/tire-hotel/${set.id}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1 py-1 text-xs transition-colors hover:bg-muted/60"
              >
                <span className="font-medium">
                  {set.quantity}x {t(`seasons.${set.season}`).toLowerCase()}
                </span>
                {set.size && <span className="text-muted-foreground">{set.size}</span>}

                {/* Where it is, which is the reason most people follow this
                    link at all. */}
                {stored && set.location ? (
                  <span className="flex items-center gap-0.5 font-mono text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {set.location.code}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t(`statuses.${set.status}`)}</span>
                )}

                {grade && grade !== 'good' && (
                  <span
                    className={cn(
                      'rounded px-1 py-px text-[10px]',
                      CONDITION_TOKENS[grade as TireCondition].badge
                    )}
                  >
                    {t(`conditions.${grade}`)}
                  </span>
                )}
                {outstanding > 0 && (
                  <span className="text-[10px] text-amber-600">
                    {t('treatments.pendingCount', { count: outstanding })}
                  </span>
                )}

                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
