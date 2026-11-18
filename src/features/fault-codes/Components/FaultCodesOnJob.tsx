'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { History, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useServiceType } from '@/components/service-type-context'
import { useFormatDate } from '@/lib/use-format-date'
import { checkFindingMeanings } from '../Actions/checkFindingMeanings'
import { takeFindingMeaning } from '../Actions/takeFindingMeaning'
import { FaultCodeChip, FaultStatusBadge, MeaningSourceLabel } from './FaultCodeChip'
import { FaultCodeEntryDialog } from './FaultCodeEntryDialog'
import { FaultCodeSheet } from './FaultCodeSheet'
import type { MeaningSource } from '../Lib/types'

/** What the work order page knows about fault codes on this job, from the server. */
export interface FaultCodesJobInfo {
  /** The workshop has the code service connected, so codes can be typed in. */
  connected: boolean
  /** Code to when it was last read on this vehicle in another job (ISO). */
  seenBefore: Record<string, string>
  /**
   * The manufacturer data the car's own codes are looked up in ("bmw" for a
   * BMW, MINI or Rolls-Royce), so BMW codes can be typed in; null otherwise.
   */
  oemSource?: string | null
}

interface JobFaultCodes extends FaultCodesJobInfo {
  vehicleId: string
  serviceRecordId: string
  locked: boolean
  openEntry: () => void
  openCode: (code: string) => void
}

const Ctx = createContext<JobFaultCodes | null>(null)

/** The job's fault code tools, or null outside a work order with a vehicle. */
export function useFaultCodesOnJob(): JobFaultCodes | null {
  return useContext(Ctx)
}

/**
 * Fault codes on a work order: the entry box and the code sheet, held once
 * for the page, so the findings section and the toolbar's button open the
 * same ones.
 */
export function FaultCodesJobProvider({
  info,
  vehicleId,
  serviceRecordId,
  concerns,
  locked,
  children,
}: {
  info: FaultCodesJobInfo
  vehicleId: string
  serviceRecordId: string
  concerns: { id: string; description: string }[]
  locked: boolean
  children: ReactNode
}) {
  const [entryOpen, setEntryOpen] = useState(false)
  const [sheetCode, setSheetCode] = useState<string | null>(null)
  const value: JobFaultCodes = {
    ...info,
    vehicleId,
    serviceRecordId,
    locked,
    openEntry: () => setEntryOpen(true),
    openCode: setSheetCode,
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      {info.connected && (
        <FaultCodeEntryDialog
          open={entryOpen}
          onOpenChange={setEntryOpen}
          serviceRecordId={serviceRecordId}
          vehicleId={vehicleId}
          concerns={concerns}
          oemSource={info.oemSource ?? null}
        />
      )}
      <FaultCodeSheet
        code={sheetCode}
        vehicleId={vehicleId}
        oemSource={info.oemSource ?? null}
        onOpenChange={(open) => !open && setSheetCode(null)}
      />
    </Ctx.Provider>
  )
}

export type MeaningUpdate = { current: string; source: MeaningSource | null }

/**
 * Which of the job's code findings now read differently at the service than
 * when they were added, asked once the page is up so nothing waits on it.
 * Only on an open job: a locked invoice keeps what it was issued with.
 */
export function useUpdatedMeanings(findingIds: string[]) {
  const job = useFaultCodesOnJob()
  const router = useRouter()
  const t = useTranslations('faultCodes.finding')
  const [updates, setUpdates] = useState<Record<string, MeaningUpdate>>({})
  const key = findingIds.slice().sort().join(',')
  const enabled = Boolean(job?.connected && !job.locked && key)
  const serviceRecordId = job?.serviceRecordId

  useEffect(() => {
    if (!enabled || !serviceRecordId) return
    let cancelled = false
    checkFindingMeanings({ serviceRecordId }).then((result) => {
      if (cancelled || !result.success || !result.data) return
      const next: Record<string, MeaningUpdate> = {}
      for (const f of result.data.findings) {
        if (f.changed && f.current) next[f.findingId] = { current: f.current, source: f.source }
      }
      setUpdates(next)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, serviceRecordId, key])

  const take = useCallback(
    async (findingId: string) => {
      const result = await takeFindingMeaning({ findingId })
      if (!result.success) {
        toast.error(result.error || t('takeFailed'))
        return
      }
      setUpdates((prev) => {
        const { [findingId]: _, ...rest } = prev
        return rest
      })
      toast.success(t('taken'))
      router.refresh()
    },
    [router, t]
  )

  return { updates, take }
}

/**
 * A finding that is a fault code, as the work order lists it: the code
 * chip, its status and module, the meaning saved with it, "Seen" when the
 * vehicle had the code in an earlier job, and "Updated meaning" when the
 * service has changed it since.
 */
export function FaultCodeFindingLine({
  finding,
  update,
  onTake,
}: {
  finding: {
    faultCode: string
    faultStatus?: string | null
    faultModule?: string | null
    faultMeaning?: string | null
    faultMeaningSource?: string | null
    description: string
  }
  update?: MeaningUpdate
  onTake?: () => void
}) {
  const t = useTranslations('faultCodes')
  const job = useFaultCodesOnJob()
  const isMarine = useServiceType() === 'marine'
  const { formatDate } = useFormatDate()
  const seen = job?.seenBefore[finding.faultCode]
  const meaning = finding.faultMeaning?.trim()
  const ownWords =
    finding.description.trim() !== finding.faultCode &&
    finding.description.trim() !== `${finding.faultCode} ${meaning ?? ''}`.trim()

  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <FaultCodeChip
          code={finding.faultCode}
          onClick={job ? () => job.openCode(finding.faultCode) : undefined}
        />
        <FaultStatusBadge status={finding.faultStatus} />
        {finding.faultModule && (
          <span className="text-[11px] text-muted-foreground">{finding.faultModule}</span>
        )}
        {seen && (
          <span
            className="inline-flex items-center gap-1 rounded-full border bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
            title={t(isMarine ? 'finding.seenBeforeTitleMarine' : 'finding.seenBeforeTitle', {
              date: formatDate(seen),
            })}
          >
            <History className="size-3" />
            {t('finding.seenBefore', { date: formatDate(seen) })}
          </span>
        )}
        {update && onTake && (
          <button
            type="button"
            onClick={onTake}
            title={t('finding.updatedMeaningTitle', { meaning: update.current })}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary hover:bg-primary/15"
          >
            <RefreshCw className="size-3" />
            {t('finding.updatedMeaning')}
          </button>
        )}
      </div>
      <p className="text-sm">
        {meaning ?? <span className="text-muted-foreground">{t('finding.noMeaningSaved')}</span>}
      </p>
      {meaning && finding.faultMeaningSource && (
        <MeaningSourceLabel
          source={finding.faultMeaningSource as MeaningSource}
          className="block"
        />
      )}
      {ownWords && <p className="text-xs text-muted-foreground">{finding.description}</p>}
    </div>
  )
}
