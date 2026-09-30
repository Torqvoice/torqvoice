'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarClock, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFormatDate } from '@/lib/use-format-date'
import {
  createWorkOrderFromInspection,
  getLinkableWorkOrders,
  linkWorkOrderToInspection,
} from '../Actions/inspectionActions'
import { CONDITION_TOKENS, type Condition } from '../Lib/conditions'
import { defectsWorstFirst } from '../Lib/conversion'

type OpenJob = {
  id: string
  title: string
  invoiceNumber: string | null
  status: string
  startDateTime: Date | string | null
  createdAt: Date | string
}

type Target = { kind: 'new' } | { kind: 'existing'; job: OpenJob }

/**
 * Where the inspection's work goes: a new job, or one of this car's open
 * jobs. The desk books an inspection as a job a week ahead, so on the day
 * there is usually a booking to land on. First the target, then, when any
 * check was not OK, whether those come along as lines.
 */
export function WorkOrderFromInspectionDialog({
  open,
  onOpenChange,
  inspectionId,
  defects,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspectionId: string
  /** Every check that was not OK, with the grade it has on screen now. */
  defects: { id: string; name: string; condition: string; sortOrder: number }[]
  onDone: (job: { id: string; vehicleId: string }) => void
}) {
  const t = useTranslations('inspections.page')
  const { formatDate } = useFormatDate()
  const [jobs, setJobs] = useState<OpenJob[] | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [step, setStep] = useState<'target' | 'defects'>('target')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(null)
    setStep('target')
    setBusy(false)
    setJobs(null)
    getLinkableWorkOrders(inspectionId).then((result) => {
      setJobs(result.success && result.data ? result.data : [])
    })
  }, [open, inspectionId])

  const ordered = defectsWorstFirst(defects)

  const finish = async (includeDefects: boolean) => {
    if (!target) return
    setBusy(true)
    const result =
      target.kind === 'new'
        ? await createWorkOrderFromInspection(inspectionId, { includeDefects })
        : await linkWorkOrderToInspection(inspectionId, target.job.id, { includeDefects })
    if (result.success && result.data) {
      if (target.kind === 'existing') {
        toast.success(t('workOrderLinked', { number: target.job.invoiceNumber ?? '' }))
      }
      onOpenChange(false)
      onDone(result.data)
    } else {
      toast.error(result.error || t('workOrderFailed'))
      setBusy(false)
    }
  }

  const next = () => {
    if (!target) return
    if (ordered.length > 0) setStep('defects')
    else void finish(false)
  }

  const optionClass = (selected: boolean) =>
    cn(
      'flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted'
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === 'target' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('linkWorkOrderTitle')}</DialogTitle>
              <DialogDescription>{t('linkWorkOrderBody')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2" role="radiogroup" aria-label={t('linkWorkOrderTitle')}>
              <button
                type="button"
                role="radio"
                aria-checked={target?.kind === 'new'}
                className={optionClass(target?.kind === 'new')}
                onClick={() => setTarget({ kind: 'new' })}
                data-testid="work-order-target-new"
              >
                <Plus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t('createNewWorkOrder')}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t('createNewWorkOrderHint')}
                  </span>
                </span>
              </button>
              <p className="text-muted-foreground pt-2 text-xs font-medium uppercase">
                {t('linkExistingWorkOrder')}
              </p>
              {jobs === null ? (
                <div className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('loadingWorkOrders')}
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-muted-foreground px-1 py-2 text-sm">{t('noOpenWorkOrders')}</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {jobs.map((job) => {
                    const selected = target?.kind === 'existing' && target.job.id === job.id
                    return (
                      <button
                        key={job.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={optionClass(selected)}
                        onClick={() => setTarget({ kind: 'existing', job })}
                        data-testid="work-order-target-existing"
                      >
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {job.invoiceNumber ? `${job.invoiceNumber} · ` : ''}
                            {job.title}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {formatDate(job.startDateTime ?? job.createdAt)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button onClick={next} disabled={!target || busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {ordered.length > 0
                  ? t('next')
                  : target?.kind === 'existing'
                    ? t('linkWorkOrder')
                    : t('createWorkOrder')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('workOrderDefectsTitle', { count: ordered.length })}</DialogTitle>
              <DialogDescription>{t('workOrderDefectsBody')}</DialogDescription>
            </DialogHeader>
            <ul className="space-y-1">
              {ordered.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${CONDITION_TOKENS[item.condition as Condition].bar}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{item.name}</span>
                </li>
              ))}
            </ul>
            {ordered.length > 6 && (
              <p className="text-muted-foreground text-sm">
                {t('workOrderDefectsMore', { count: ordered.length - 6 })}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('target')} disabled={busy}>
                {t('previousStep')}
              </Button>
              <Button variant="outline" onClick={() => void finish(false)} disabled={busy}>
                {t('workOrderInspectionOnly')}
              </Button>
              <Button onClick={() => void finish(true)} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('workOrderAddDefects', { count: ordered.length })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
