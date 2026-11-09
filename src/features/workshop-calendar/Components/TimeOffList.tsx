'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import { deleteAbsence, type AbsenceView } from '../Actions/absenceActions'
import { TimeOffDialog, type TechnicianOption } from './TimeOffDialog'
import { useStretchLabel } from './useStretchLabel'

/**
 * Upcoming and recent time off, with add, edit and remove. The same list on
 * the settings page and behind the work board's Time off button.
 */
export function TimeOffList({
  absences,
  technicians,
  canEdit,
  today,
  onChanged,
}: {
  absences: AbsenceView[]
  technicians: TechnicianOption[]
  canEdit: boolean
  /** The workshop's today, "YYYY-MM-DD": new time off starts here. */
  today: string
  onChanged: () => void
}) {
  const t = useTranslations('workshopCalendar.timeOff')
  const tr = useTranslations('workshopCalendar.reasons')
  const tc = useTranslations('common')
  const confirm = useConfirm()
  const label = useStretchLabel({ weekday: true })
  const [editing, setEditing] = useState<AbsenceView | null>(null)
  const [open, setOpen] = useState(false)

  const remove = async (absence: AbsenceView) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription', { name: absence.technicianName }),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    const res = await deleteAbsence(absence.id)
    if (!res.success) {
      toast.error(res.error ?? tc('errors.unexpected'))
      return
    }
    toast.success(t('deleted'))
    onChanged()
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('add')}
        </Button>
      )}

      {absences.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {absences.map((absence) => (
            <li
              key={absence.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              data-testid="time-off-row"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: absence.technicianColor }}
              />
              <span className="font-medium">{absence.technicianName}</span>
              <Badge variant="secondary">
                {tr.has(absence.reason) ? tr(absence.reason) : absence.reason}
              </Badge>
              <span className="text-muted-foreground">{label(absence)}</span>
              {absence.note && <span className="text-muted-foreground">· {absence.note}</span>}
              {canEdit && (
                <span className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t('edit')}
                    title={t('edit')}
                    onClick={() => {
                      setEditing(absence)
                      setOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={tc('buttons.delete')}
                    title={tc('buttons.delete')}
                    onClick={() => remove(absence)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <TimeOffDialog
        open={open}
        onOpenChange={setOpen}
        absence={editing}
        technicians={technicians}
        defaultDate={today}
        onSaved={onChanged}
      />
    </div>
  )
}
