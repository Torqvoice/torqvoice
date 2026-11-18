'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listAbsences, type AbsenceView } from '../Actions/absenceActions'
import type { TechnicianOption } from './TimeOffDialog'
import { TimeOffList } from './TimeOffList'

/** Leave and out of office for the whole team, opened from the work board. */
export function TimeOffManagerDialog({
  open,
  onOpenChange,
  technicians,
  today,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  technicians: TechnicianOption[]
  today: string
  /** After an add, edit or remove, so the board can redraw who is away. */
  onChanged: () => void
}) {
  const t = useTranslations('workshopCalendar.timeOff')
  const [absences, setAbsences] = useState<AbsenceView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await listAbsences()
    if (res.success && res.data) {
      setAbsences(res.data)
      setError(null)
    } else {
      setError(res.error ?? null)
      setAbsences([])
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('manage')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {absences === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <TimeOffList
              absences={absences}
              technicians={technicians}
              canEdit
              today={today}
              onChanged={() => {
                load()
                onChanged()
              }}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
