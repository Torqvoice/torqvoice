'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useServiceType } from '@/components/service-type-context'
import { cn } from '@/lib/utils'
import { reportFaultCodeMeaning } from '../Actions/reportFaultCodeMeaning'
import type { ReportState } from '../Lib/types'
import { REPORT_REASONS } from '../Schema/faultCodeSchema'

type Reason = (typeof REPORT_REASONS)[number]

/**
 * "This doesn't match": a flag beside a meaning that opens a small popover.
 * A reason and an optional note on what was found, then Send. Once sent,
 * the meaning says "Reported by you", and later how it was settled.
 */
export function ReportMeaningPopover({
  code,
  version,
  lang,
  vehicleId,
  report,
  onReported,
}: {
  code: string
  /** The service's version of the meaning shown; nothing to report without one. */
  version: number | null
  lang: string | null
  vehicleId?: string | null
  report: ReportState | null
  onReported: (report: ReportState) => void
}) {
  const t = useTranslations('faultCodes.report')
  const isMarine = useServiceType() === 'marine'
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!reason || version === null) return
    setSending(true)
    const result = await reportFaultCodeMeaning({
      code,
      version,
      lang: lang ?? 'en',
      reason,
      note: note.trim() || undefined,
      vehicleId: vehicleId ?? null,
    })
    setSending(false)
    if (result.success && result.data?.sent && result.data.report) {
      toast.success(t('thanks'))
      onReported(result.data.report)
      setOpen(false)
      setReason(null)
      setNote('')
      return
    }
    toast.error(result.success ? t('failed') : result.error || t('failed'))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {report && <ReportedPill report={report} />}
      {version !== null && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
              <Flag />
              {t('button')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
            <p className="text-sm font-medium">{t('title', { code })}</p>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label={t('title', { code })}
            >
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    reason === r
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {r === 'wrong_for_vehicle' && isMarine
                    ? t('reasons.wrong_for_vehicleMarine')
                    : t(`reasons.${r}`)}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`report-note-${code}`} className="text-xs">
                {t('note')}
              </Label>
              <Input
                id={`report-note-${code}`}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('notePlaceholder')}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="button" size="sm" disabled={!reason || sending} onClick={send}>
                {sending && <Loader2 className="animate-spin" />}
                {t('send')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/** "Reported by you", or how the report was settled once it was. */
export function ReportedPill({ report }: { report: ReportState }) {
  const t = useTranslations('faultCodes.report')
  const label =
    report.status === 'resolved' && report.outcome
      ? t(`outcome.${report.outcome}`)
      : t('reportedByYou')
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
      title={report.message ?? undefined}
    >
      <Flag className="size-3" />
      {label}
    </span>
  )
}
