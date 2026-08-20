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
import { Loader2 } from 'lucide-react'
import { LocationPicker, type PickerLocation } from './LocationPicker'
import { relocateTireSet } from '../Actions/tireSetActions'

/**
 * Moving a set between shelves, e.g. when consolidating a rack.
 *
 * The set's current shelf is excluded from the picker: the space it already
 * occupies there is not space it can move into.
 */
export function RelocateDialog({
  open,
  onOpenChange,
  tireSetId,
  reference,
  quantity,
  currentLocationId,
  locations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  reference: string | null
  quantity: number
  currentLocationId: string | null
  locations: PickerLocation[]
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) return
    setLocationId(null)
    setNote('')
  }, [open])

  const options = locations.filter((l) => l.id !== currentLocationId)

  const handleSubmit = async () => {
    if (!locationId) return
    setSaving(true)
    const result = await relocateTireSet({ id: tireSetId, toLocationId: locationId, note })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('relocate.failed'))
      return
    }
    toast.success(t('relocate.success', { reference: reference ?? '' }))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('relocate.title')}</DialogTitle>
          <DialogDescription>{t('relocate.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('relocate.newLocation')}</Label>
            <LocationPicker
              locations={options}
              value={locationId}
              onChange={setLocationId}
              quantity={quantity}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="relocateNote">{t('relocate.note')}</Label>
            <Textarea
              id="relocateNote"
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
          <Button onClick={handleSubmit} disabled={saving || !locationId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('relocate.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
