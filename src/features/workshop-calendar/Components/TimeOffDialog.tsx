'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createAbsence,
  deleteAbsence,
  updateAbsence,
  type AbsenceView,
} from '../Actions/absenceActions'
import { ABSENCE_REASONS, type AbsenceReason } from '../Lib/calendar'
import {
  StretchFields,
  type StretchValue,
  stretchFromRow,
  stretchPayload,
  stretchProblem,
} from './StretchFields'

export interface TechnicianOption {
  id: string
  name: string
  color?: string | null
}

/** Add or edit one stretch of a technician's time off. */
export function TimeOffDialog({
  open,
  onOpenChange,
  absence,
  technicians,
  defaultTechnicianId,
  defaultDate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  absence?: AbsenceView | null
  technicians: TechnicianOption[]
  defaultTechnicianId?: string
  defaultDate: string
  onSaved: (absence?: AbsenceView) => void
}) {
  const t = useTranslations('workshopCalendar.timeOff')
  const tr = useTranslations('workshopCalendar.reasons')
  const tc = useTranslations('common')
  const [technicianId, setTechnicianId] = useState('')
  const [reason, setReason] = useState<AbsenceReason>('holiday')
  const [note, setNote] = useState('')
  const [stretch, setStretch] = useState<StretchValue>(() =>
    stretchFromRow({ startDate: defaultDate, endDate: defaultDate })
  )
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (!open) return
    setTechnicianId(absence?.technicianId ?? defaultTechnicianId ?? '')
    setReason(
      (ABSENCE_REASONS as readonly string[]).includes(absence?.reason ?? '')
        ? (absence?.reason as AbsenceReason)
        : 'holiday'
    )
    setNote(absence?.note ?? '')
    setStretch(stretchFromRow(absence ?? { startDate: defaultDate, endDate: defaultDate }))
    setTried(false)
  }, [open, absence, defaultTechnicianId, defaultDate])

  const problem = stretchProblem(stretch)

  const save = async () => {
    setTried(true)
    if (!technicianId || problem) return
    setSaving(true)
    const payload = { technicianId, reason, note: note.trim() || null, ...stretchPayload(stretch) }
    // An action that cannot reach the server throws instead of answering,
    // here and in the delete below, so it is caught and reported the way a
    // refusal is, and the dialog's buttons work again.
    const res = absence
      ? await updateAbsence({ id: absence.id, ...payload }).catch(() => null)
      : await createAbsence(payload).catch(() => null)
    setSaving(false)
    if (!res?.success) {
      toast.error(res?.error ?? tc('errors.unexpected'))
      return
    }
    toast.success(t('saved'))
    onOpenChange(false)
    onSaved(absence ? undefined : (res.data as AbsenceView))
  }

  const remove = async () => {
    if (!absence) return
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription', { name: absence.technicianName }),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    setSaving(true)
    const res = await deleteAbsence(absence.id).catch(() => null)
    setSaving(false)
    if (!res?.success) {
      toast.error(res?.error ?? tc('errors.unexpected'))
      return
    }
    toast.success(t('deleted'))
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{absence ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {technicians.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noTechnicians')}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="time-off-technician">{t('technician')}</Label>
                  <SearchableSelect
                    id="time-off-technician"
                    value={technicianId}
                    onValueChange={setTechnicianId}
                    placeholder={t('pickTechnician')}
                    options={technicians.map((tech) => ({ value: tech.id, label: tech.name }))}
                  />
                  {tried && !technicianId && (
                    <p role="alert" className="text-sm text-destructive">
                      {t('pickTechnician')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time-off-reason">{t('reason')}</Label>
                  <Select value={reason} onValueChange={(v) => setReason(v as AbsenceReason)}>
                    <SelectTrigger id="time-off-reason">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {tr(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <StretchFields idPrefix="time-off" value={stretch} onChange={setStretch} />
              <div className="space-y-2">
                <Label htmlFor="time-off-note">{t('note')}</Label>
                <Input
                  id="time-off-note"
                  value={note}
                  maxLength={200}
                  placeholder={t('notePlaceholder')}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {absence && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto"
              onClick={remove}
              disabled={saving}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {tc('buttons.delete')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('buttons.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || technicians.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tc('buttons.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
