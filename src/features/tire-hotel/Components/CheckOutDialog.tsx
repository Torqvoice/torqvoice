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
import { TIRE_ROAD_POSITIONS, thirtySecondsToMm } from '../Lib/tireConstants'
import { pendingTreatments } from '../Lib/treatments'

/**
 * Departure.
 *
 * Offers a second measurement round on the way out, because the difference
 * between the arrival reading and this one is the wear over a season — the
 * thing worth telling the customer while they are standing at the counter.
 */
export function CheckOutDialog({
  open,
  onOpenChange,
  tireSetId,
  reference,
  locationCode,
  season,
  imperial,
  treatments = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  reference: string | null
  locationCode: string | null
  season: string
  imperial: boolean
  treatments?: { type: string; status: string }[]
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

          <div className="space-y-2">
            <Label>{t('checkOut.treadTitle')}</Label>
            <p className="text-xs text-muted-foreground">{t('checkOut.treadHint')}</p>
            <TreadEntry rows={treads} onChange={setTreads} imperial={imperial} season={season} />
          </div>

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
