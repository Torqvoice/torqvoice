'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, TriangleAlert } from 'lucide-react'
import { TreadEntry, type TreadRow } from './TreadEntry'
import { checkOutTireSet } from '../Actions/tireSetActions'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CONDITION_TOKENS,
  TIRE_ROAD_POSITIONS,
  mmToThirtySeconds,
  thirtySecondsToMm,
  shownCondition,
  worstCondition,
} from '../Lib/tireConstants'
import { pendingTreatments } from '../Lib/treatments'

/**
 * Departure.
 *
 * Deliberately does not ask for tread again. Tires do not wear on a shelf:
 * the wear happened on the car before they arrived, which is what the
 * check-in reading captures. Measuring a second time would record the same
 * numbers and imply a change that cannot have occurred.
 *
 * What is worth doing here is telling the customer what those tires are
 * already known to be. A set that came in below the replacement limit is
 * going back onto a car in that state, and the moment to say so is while
 * they are standing at the counter, which is also the moment a shop sells
 * the replacement.
 */
export function CheckOutDialog({
  open,
  onOpenChange,
  tireSetId,
  reference,
  locationCode,
  season,
  imperial,
  thresholds,
  treatments = [],
  latestMeasurements = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  reference: string | null
  locationCode: string | null
  season: string
  imperial: boolean
  /** The workshop's own replacement limits, so the grade matches settings. */
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
  treatments?: { type: string; status: string }[]
  /** The most recent reading round, normally taken at check-in. */
  latestMeasurements?: { position: string; treadDepthMm: number | null; condition: string }[]
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [treads, setTreads] = useState<TreadRow[]>(() =>
    TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' }))
  )

  useEffect(() => {
    if (open) return
    setNote('')
    setTreads(TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' })))
  }, [open])

  const outstanding = pendingTreatments(treatments)

  // Nothing was ever measured, so this is the last chance to record it before
  // the tires leave the building.
  const neverMeasured = latestMeasurements.length === 0
  const gradeOf = (m: { treadDepthMm: number | null; condition: string }) =>
    shownCondition(m, season, thresholds)
  const worst = neverMeasured ? null : worstCondition(latestMeasurements.map(gradeOf))

  const formatTread = (mm: number | null) => {
    if (mm == null) return '-'
    return imperial ? `${mmToThirtySeconds(mm).toFixed(1)}/32"` : `${mm.toFixed(1)} mm`
  }

  const handleSubmit = async () => {
    setSaving(true)
    const measurements = treads
      .filter((row) => row.tread.trim() !== '' || row.condition !== 'good')
      .map((row) => {
        const entered = Number(row.tread)
        const treadDepthMm = Number.isFinite(entered)
          ? imperial
            ? Number(thirtySecondsToMm(entered).toFixed(2))
            : entered
          : null
        return { position: row.position, treadDepthMm, condition: row.condition }
      })

    const result = await checkOutTireSet({ id: tireSetId, note, measurements })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('checkOut.failed'))
      return
    }
    toast.success(t('checkOut.success', { reference: reference ?? '' }))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('checkOut.title')}</DialogTitle>
          <DialogDescription>
            {locationCode
              ? t('checkOut.description', { code: locationCode })
              : t('checkOut.descriptionNoLocation')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Handing back tires that were never washed is the complaint this
              module exists to prevent, so unfinished prep is surfaced here
              rather than left for someone to notice. It warns and does not
              block: the shop may have good reason to release them anyway. */}
          {outstanding.length > 0 && (
            <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-500">
                  {t('checkOut.prepPending', { count: outstanding.length })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {outstanding.map((x) => t(`treatments.types.${x.type}`)).join(', ')}
                </p>
              </div>
            </div>
          )}

          {neverMeasured ? (
            <div className="space-y-2">
              <Label>{t('checkOut.treadTitle')}</Label>
              <p className="text-xs text-muted-foreground">{t('checkOut.treadHintUnmeasured')}</p>
              <TreadEntry
                rows={treads}
                onChange={setTreads}
                imperial={imperial}
                season={season}
                thresholds={thresholds}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t('checkOut.conditionTitle')}</Label>
              {worst !== 'good' && (
                <p
                  className={cn(
                    'text-xs font-medium',
                    worst === 'replace' ? 'text-red-600' : 'text-amber-600'
                  )}
                >
                  {t(`checkOut.conditionLead.${worst}`)}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {latestMeasurements.map((m) => (
                  <div
                    key={m.position}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                  >
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {t(`positions.${m.position}`)}
                    </span>
                    <span className="flex-1 text-sm tabular-nums">
                      {formatTread(m.treadDepthMm)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 text-[10px]', CONDITION_TOKENS[gradeOf(m)].badge)}
                    >
                      {t(`conditions.${gradeOf(m)}`)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="checkOutNote">{t('checkOut.note')}</Label>
            <Textarea
              id="checkOutNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('checkOut.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
