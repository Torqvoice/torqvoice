'use client'

import { useTranslations } from 'next-intl'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useServiceType } from '@/components/service-type-context'
import { cn } from '@/lib/utils'
import type {
  FaultCodeOwnWaveform,
  FaultCodeWaveform,
  WaveformCondition,
  WaveformFileRole,
} from '@/features/integrations/Lib/types'

/** Where the app serves a shared waveform's file from the code service. */
export function waveformFileUrl(
  id: string,
  role: WaveformFileRole,
  size: 'full' | 'thumb' = 'full'
): string {
  const base = `/api/protected/fault-codes/waveforms/${encodeURIComponent(id)}/files/${role}`
  return size === 'thumb' ? `${base}?size=thumb` : base
}

/** A waveform on the page: a published one, or this workshop's own with its review. */
export type ListedWaveform = FaultCodeWaveform & {
  status?: FaultCodeOwnWaveform['status']
  reason?: string | null
  own: boolean
}

/** Known good and faulty, drawn the same way everywhere a waveform is named. */
export function KindBadge({
  kind,
  className,
}: {
  kind: FaultCodeWaveform['kind']
  className?: string
}) {
  const t = useTranslations('faultCodes.waveforms.kind')
  const Icon = kind === 'good' ? CircleCheck : TriangleAlert
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        kind === 'good'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(kind)}
    </span>
  )
}

/** How the engine ran, in words; a boat is under way rather than driving. */
export function useConditionLabel() {
  const t = useTranslations('faultCodes.waveforms.condition')
  const isMarine = useServiceType() === 'marine'
  return (c: WaveformCondition) => (c === 'driving' && isMarine ? t('drivingMarine') : t(c))
}

export function hasImage(w: FaultCodeWaveform): boolean {
  return w.files.some((f) => f.role === 'image')
}
