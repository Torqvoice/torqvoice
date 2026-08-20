'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { ChevronRight, Disc3, Loader2, TriangleAlert, Unlink } from 'lucide-react'
import { unlinkTireSetFromWorkOrder } from '../Actions/tireJobActions'
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
 * A strip rather than a card, and deliberately short. It sits above the work
 * order's own content, so every line it takes is a line pushing the parts and
 * labour further down the screen.
 *
 * It carries only what the job does not already say. The title is already the
 * tire description, so repeating the brand and size here would spend the
 * space on something the technician has just read. What is left is the part
 * only the tire hotel knows: which shelf, what state they came in, and
 * whether anything is still owed on them before they go on the car.
 */
export function TireSetBanner({
  set,
  serviceRecordId,
}: {
  set: TireSetBannerData
  /** Present on a work order, where the link can be undone. */
  serviceRecordId?: string
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const confirm = useConfirm()
  const [unlinking, setUnlinking] = useState(false)

  const handleUnlink = async () => {
    if (!serviceRecordId) return
    const ok = await confirm({
      title: t('job.unlinkTitle'),
      description: t('job.unlinkBody'),
      confirmLabel: t('job.unlink'),
      destructive: true,
    })
    if (!ok) return
    setUnlinking(true)
    const result = await unlinkTireSetFromWorkOrder(serviceRecordId)
    setUnlinking(false)
    if (!result.success) {
      toast.error(result.error ?? t('job.unlinkFailed'))
      return
    }
    toast.success(t('job.unlinked'))
    router.refresh()
  }
  const grade =
    set.measurements.length > 0 ? worstCondition(set.measurements.map((m) => m.condition)) : null
  const outstanding = pendingTreatments(set.treatments)

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Disc3 className="h-4 w-4 text-primary" />
        </div>

        {/* The shelf is the whole point of the strip, so it is the only thing
            set at size. */}
        <div className="min-w-0">
          <p className="text-[11px] leading-none text-muted-foreground">{t('job.bannerTitle')}</p>
          {set.location ? (
            <p className="mt-0.5 truncate font-mono text-base font-semibold leading-tight">
              {set.location.code}
              <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                {set.location.warehouse.name}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm font-medium leading-tight text-muted-foreground">
              {t('job.notOnShelf')}
            </p>
          )}
        </div>

        <div className="hidden h-8 w-px bg-border sm:block" />

        {/* Handling notes, not identity: what a technician needs to know
            before picking them up. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {grade && grade !== 'good' && (
            <Badge
              variant="outline"
              className={cn('text-[10px]', CONDITION_TOKENS[grade as TireCondition].badge)}
            >
              {t(`conditions.${grade}`)}
            </Badge>
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
          {set.size && (
            // Small and last: the title already carries this, and it is here
            // only so an edited title cannot leave the strip ambiguous.
            <span className="text-[11px] text-muted-foreground">{set.size}</span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            href={`/tire-hotel/${set.id}`}
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            {t('job.openSet')}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          {serviceRecordId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleUnlink}
              disabled={unlinking}
              aria-label={t('job.unlink')}
              title={t('job.unlink')}
            >
              {unlinking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Discovered at the car, this is a second trip. Inline rather than in
          a panel of its own, which would double the height of the strip. */}
      {outstanding.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            {t('job.prepPending', {
              jobs: outstanding.map((x) => t(`treatments.types.${x.type}`)).join(', '),
            })}
          </span>
        </p>
      )}
    </div>
  )
}
