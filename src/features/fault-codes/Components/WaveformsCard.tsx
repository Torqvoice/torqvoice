'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Activity, ImageIcon, Upload } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useServiceType } from '@/components/service-type-context'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import type { FaultCodeOwnWaveform, FaultCodeWaveform } from '@/features/integrations/Lib/types'
import type { CodeVehicle, CodeWaveforms } from '../Lib/types'
import { fixVehicleLine } from './FixPhotos'
import { ShareWaveformDialog } from './ShareWaveformDialog'
import { WaveformChart } from './WaveformChart'
import {
  hasImage,
  KindBadge,
  type ListedWaveform,
  useConditionLabel,
  waveformFileUrl,
} from './WaveformParts'
import { WaveformViewer } from './WaveformViewer'

/**
 * "Waveforms" on a code's page: scope recordings other workshops shared, known good and
 * faulty, each drawn small from its CSV export or shown as its picture, a click away from the
 * full view, its files and a side-by-side compare. This workshop's own show with how their
 * review stands, and "Share a waveform" opens the dialog to send one.
 */
export function WaveformsCard({
  code,
  label = code,
  meaning = null,
  makes = null,
  vehicle,
  state,
}: {
  code: string
  /** The code as people read it ("BMW 283700"); the code itself otherwise. */
  label?: string
  /** For a make's own code, the meaning on screen: only its waveforms, and the code's as a whole. */
  meaning?: { id: string; title: string } | null
  makes?: string[] | null
  vehicle: CodeVehicle | null
  state: CodeWaveforms
}) {
  const t = useTranslations('faultCodes.waveforms')
  const isMarine = useServiceType() === 'marine'
  const [own, setOwn] = useState<FaultCodeOwnWaveform[]>(state.own)
  const [published, setPublished] = useState<FaultCodeWaveform[]>(state.published)
  const [filter, setFilter] = useState<'all' | 'good' | 'faulty'>('all')
  const [sharing, setSharing] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  // Ours first while they wait for review, then the published, known good before faulty.
  const all = useMemo<ListedWaveform[]>(() => {
    const ownIds = new Set(own.map((w) => w.id))
    const waiting = own.filter((w) => w.status !== 'published').map((w) => ({ ...w, own: true }))
    const live = [
      ...published.map((w) => ({ ...w, own: ownIds.has(w.id) })),
      ...own
        .filter((w) => w.status === 'published' && !published.some((p) => p.id === w.id))
        .map((w) => ({ ...w, own: true })),
    ].sort((a, b) =>
      a.kind === b.kind ? b.createdAt.localeCompare(a.createdAt) : a.kind === 'good' ? -1 : 1
    )
    return [...waiting, ...live].filter(
      (w) => !meaning || w.meaning === null || w.meaning === meaning.id
    )
  }, [own, published, meaning])

  const kinds = new Set(all.map((w) => w.kind))
  // A kind no longer there (the last one withdrawn, another meaning chosen) shows them all.
  const active = filter !== 'all' && kinds.has(filter) ? filter : 'all'
  const shown = active === 'all' ? all : all.filter((w) => w.kind === active)
  const open = all.find((w) => w.id === viewing) ?? null

  const removed = (id: string) => {
    setOwn((current) => current.filter((w) => w.id !== id))
    setPublished((current) => current.filter((w) => w.id !== id))
    setViewing(null)
  }

  return (
    <AppCard
      icon={Activity}
      title={t('title')}
      description={t('description')}
      badge={all.length > 0 ? all.length : undefined}
      action={
        state.available && all.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setSharing(true)}>
            <Upload />
            {t('share')}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-4"
    >
      {!state.available ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-muted/20 p-5 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Activity className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{t('empty', { code: label })}</p>
            <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
          </div>
          <Button type="button" onClick={() => setSharing(true)} className="shrink-0">
            <Upload />
            {t('share')}
          </Button>
        </div>
      ) : (
        <>
          {kinds.size > 1 && (
            <div
              className="inline-flex rounded-md border border-card-edge bg-muted/30 p-0.5"
              role="group"
              aria-label={t('filter.label')}
            >
              {(['all', 'good', 'faulty'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                    active === f && 'bg-background text-foreground shadow-sm'
                  )}
                >
                  {t(`filter.${f}`)}
                </button>
              ))}
            </div>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((w) => (
              <li key={w.id}>
                <WaveformTile
                  waveform={w}
                  unknownVehicle={isMarine ? t('unknownVehicleMarine') : t('unknownVehicle')}
                  onOpen={() => {
                    track('fault_code:waveform_open', {
                      code,
                      kind: w.kind,
                      trace: Boolean(w.preview),
                      own: w.own,
                    })
                    setViewing(w.id)
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <WaveformViewer
          waveform={open}
          others={all.filter((w) => w.id !== open.id && (w.preview || hasImage(w)))}
          code={code}
          onOpenChange={(next) => !next && setViewing(null)}
          onWithdrawn={() => removed(open.id)}
        />
      )}

      {state.available && (
        <ShareWaveformDialog
          open={sharing}
          onOpenChange={setSharing}
          code={code}
          label={label}
          meaning={meaning}
          makes={makes}
          vehicle={vehicle}
          onShared={(w) => setOwn((current) => [w, ...current])}
        />
      )}
    </AppCard>
  )
}

/** One waveform in the list: its picture of the trace, what it shows and on what. */
function WaveformTile({
  waveform: w,
  unknownVehicle,
  onOpen,
}: {
  waveform: ListedWaveform
  unknownVehicle: string
  onOpen: () => void
}) {
  const t = useTranslations('faultCodes.waveforms')
  const conditionLabel = useConditionLabel()
  const vehicle = fixVehicleLine(w.vehicle)
  const files = w.files.filter((f) => f.role === 'psdata' || f.role === 'csv').length
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-card-edge bg-card text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        {w.preview ? (
          <WaveformChart
            preview={w.preview}
            compact
            className="[&>div]:rounded-none [&>div]:border-0 [&>div]:border-b"
          />
        ) : hasImage(w) ? (
          <img
            src={waveformFileUrl(w.id, 'image', 'thumb')}
            alt=""
            loading="lazy"
            className="aspect-[25/9] w-full border-b border-card-edge bg-muted object-cover"
          />
        ) : (
          <div className="flex aspect-[25/9] items-center justify-center border-b border-card-edge bg-muted/25 text-muted-foreground">
            <ImageIcon className="size-5" aria-hidden />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-background shadow-sm">
            <KindBadge kind={w.kind} />
          </span>
          {w.own && w.status && w.status !== 'published' && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border bg-background/90 px-2 py-0.5 text-[11px] font-medium',
                w.status === 'pending' && 'text-muted-foreground',
                w.status === 'rejected' && 'border-destructive/40 text-destructive'
              )}
            >
              {t(`status.${w.status}`)}
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-1 px-3.5 py-3">
        <p className="truncate text-sm font-medium group-hover:text-primary">{w.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[w.condition ? conditionLabel(w.condition) : null, vehicle ?? unknownVehicle]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {files > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {w.files.some((f) => f.role === 'psdata') ? t('hasRecording') : t('hasCsv')}
          </p>
        )}
      </div>
    </button>
  )
}
