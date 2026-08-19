'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { Check, CheckCheck, ClipboardList, Loader2, Pencil, Undo2 } from 'lucide-react'
import { TREATMENT_ICON_MAP, TreatmentPicker } from './TreatmentPicker'
import { completeAllTreatments, markTreatment, setTreatments } from '../Actions/treatmentActions'
import { treatmentProgress, type TreatmentType } from '../Lib/treatments'

export type TreatmentRow = {
  id: string
  type: string
  status: string
  notes: string | null
  completedAt: Date | null
  completedBy: { id: string; name: string } | null
}

/**
 * The tire department's working view of one set.
 *
 * Outstanding jobs come first and are the only ones with a big tick target,
 * because that is the whole interaction: read what is left, do it, tick it.
 * Finished jobs stay visible but recede, carrying who did them and when — the
 * answer to "was this actually washed?" at pickup.
 */
export function TreatmentCard({
  tireSetId,
  treatments,
  withRims,
  hasTpms,
}: {
  tireSetId: string
  treatments: TreatmentRow[]
  withRims: boolean
  hasTpms: boolean
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TreatmentType[]>([])
  const [saving, setSaving] = useState(false)

  const progress = treatmentProgress(treatments)
  const pending = treatments.filter((x) => x.status === 'pending')
  const settled = treatments.filter((x) => x.status !== 'pending')

  const startEditing = () => {
    setDraft(treatments.map((x) => x.type as TreatmentType))
    setEditing(true)
  }

  const handleSaveList = async () => {
    setSaving(true)
    const result = await setTreatments({ tireSetId, types: draft })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error ?? t('treatments.saveFailed'))
      return
    }
    setEditing(false)
    router.refresh()
  }

  const handleMark = async (id: string, status: 'done' | 'pending' | 'skipped') => {
    setBusyId(id)
    const result = await markTreatment({ id, status })
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('treatments.saveFailed'))
      return
    }
    router.refresh()
  }

  const handleCompleteAll = async () => {
    setBusyId('all')
    const result = await completeAllTreatments(tireSetId)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('treatments.saveFailed'))
      return
    }
    toast.success(t('treatments.allDone'))
    router.refresh()
  }

  return (
    <AppCard
      icon={ClipboardList}
      title={t('treatments.title')}
      badge={
        progress.pending > 0 ? (
          <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-600">
            {t('treatments.pendingCount', { count: progress.pending })}
          </Badge>
        ) : progress.complete ? (
          <Badge
            variant="outline"
            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
          >
            {t('treatments.allComplete')}
          </Badge>
        ) : undefined
      }
      action={
        !editing && (
          <Button size="sm" variant="ghost" className="h-8" onClick={startEditing}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
        )
      }
      contentClassName="space-y-3"
    >
      {editing ? (
        <>
          <p className="text-sm text-muted-foreground">{t('treatments.pickHint')}</p>
          <TreatmentPicker
            selected={draft}
            onChange={setDraft}
            withRims={withRims}
            hasTpms={hasTpms}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveList} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </>
      ) : treatments.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{t('treatments.none')}</p>
          <Button size="sm" variant="outline" onClick={startEditing}>
            {t('treatments.add')}
          </Button>
        </div>
      ) : (
        <>
          {/* Outstanding work: one row, one big tick. */}
          {pending.map((treatment) => {
            const Icon = TREATMENT_ICON_MAP[treatment.type as TreatmentType]
            return (
              <div
                key={treatment.id}
                className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
              >
                {Icon && <Icon className="h-5 w-5 shrink-0 text-amber-600" />}
                <span className="min-w-0 flex-1 font-medium">
                  {t(`treatments.types.${treatment.type}`)}
                </span>
                <Button
                  size="sm"
                  onClick={() => handleMark(treatment.id, 'done')}
                  disabled={busyId === treatment.id}
                >
                  {busyId === treatment.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('treatments.markDone')}
                </Button>
              </div>
            )
          })}

          {pending.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleCompleteAll}
              disabled={busyId === 'all'}
            >
              {busyId === 'all' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('treatments.completeAll', { count: pending.length })}
            </Button>
          )}

          {/* Finished work recedes but stays auditable. */}
          {settled.map((treatment) => {
            const Icon = TREATMENT_ICON_MAP[treatment.type as TreatmentType]
            const isDone = treatment.status === 'done'
            return (
              <div
                key={treatment.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                {Icon && (
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isDone ? 'text-emerald-600' : 'text-muted-foreground'
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className={cn(isDone && 'text-muted-foreground line-through')}>
                    {t(`treatments.types.${treatment.type}`)}
                  </span>
                  {isDone && treatment.completedAt && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDate(new Date(treatment.completedAt))}
                      {treatment.completedBy ? ` · ${treatment.completedBy.name}` : ''}
                    </span>
                  )}
                  {!isDone && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('treatments.statuses.skipped')}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={() => handleMark(treatment.id, 'pending')}
                  disabled={busyId === treatment.id}
                  aria-label={t('treatments.undo')}
                  title={t('treatments.undo')}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </>
      )}
    </AppCard>
  )
}
