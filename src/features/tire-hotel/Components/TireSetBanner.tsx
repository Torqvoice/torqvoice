'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Disc3, MapPin, TriangleAlert } from 'lucide-react'
import { CONDITION_TOKENS, worstCondition, type TireCondition } from '../Lib/tireConstants'
import { pendingTreatments } from '../Lib/treatments'

export type TireSetBannerData = {
  id: string
  reference: string | null
  season: string
  studded: boolean
  size: string | null
  brand: string | null
  quantity: number
  withRims: boolean
  hasTpms: boolean
  status: string
  location: { code: string; warehouse: { name: string } } | null
  measurements: { condition: string }[]
  treatments: { type: string; status: string }[]
}

/**
 * Which tires this job is about, on the job itself.
 *
 * The shelf code leads and is the largest thing on the panel, because the
 * first action a technician takes on a tire job is walking off to fetch them.
 * Everything else on this banner is there to stop a second trip: whether they
 * are on rims, whether they carry sensors, whether anything is still owed on
 * them before they go back on the car.
 */
export function TireSetBanner({ set }: { set: TireSetBannerData }) {
  const t = useTranslations('tireHotel')
  const grade =
    set.measurements.length > 0 ? worstCondition(set.measurements.map((m) => m.condition)) : null
  const outstanding = pendingTreatments(set.treatments)
  const released = set.status !== 'stored'

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Disc3 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('job.bannerTitle')}</p>
            {set.location ? (
              <p className="flex items-center gap-1.5 font-mono text-lg font-semibold leading-tight">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                {set.location.code}
              </p>
            ) : (
              <p className="text-lg font-semibold leading-tight text-muted-foreground">
                {t(`statuses.${set.status}`)}
              </p>
            )}
            {set.location && (
              <p className="text-xs text-muted-foreground">{set.location.warehouse.name}</p>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">
            {[`${set.quantity}x`, set.brand, set.size, t(`seasons.${set.season}`).toLowerCase()]
              .filter(Boolean)
              .join(' ')}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {set.reference && (
              <span className="font-mono text-xs text-muted-foreground">#{set.reference}</span>
            )}
            {set.withRims && (
              <Badge variant="secondary" className="text-[10px]">
                {t('checkIn.withRims')}
              </Badge>
            )}
            {set.hasTpms && (
              <Badge variant="secondary" className="text-[10px]">
                {t('checkIn.hasTpms')}
              </Badge>
            )}
            {set.studded && (
              <Badge variant="secondary" className="text-[10px]">
                {t('checkIn.studded')}
              </Badge>
            )}
            {grade && (
              <Badge
                variant="outline"
                className={cn('text-[10px]', CONDITION_TOKENS[grade as TireCondition].badge)}
              >
                {t(`conditions.${grade}`)}
              </Badge>
            )}
          </div>
        </div>

        <Link
          href={`/tire-hotel/${set.id}`}
          className="shrink-0 self-center text-xs text-primary hover:underline"
        >
          {t('job.openSet')}
        </Link>
      </div>

      {/* Both of these send a technician back for a second trip if they are
          found at the car rather than here. */}
      {(outstanding.length > 0 || released) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {outstanding.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {t('job.prepPending', {
                jobs: outstanding.map((x) => t(`treatments.types.${x.type}`)).join(', '),
              })}
            </p>
          )}
          {released && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {t('job.notOnShelf')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
