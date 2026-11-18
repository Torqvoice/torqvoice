'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Activity,
  Download,
  FileSpreadsheet,
  ImageIcon,
  Loader2,
  Settings2,
  Trash2,
  Waves,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-dialog'
import { useServiceType } from '@/components/service-type-context'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatDate } from '@/lib/use-format-date'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'
import type { WaveformFileRole } from '@/features/integrations/Lib/types'
import { withdrawFaultCodeWaveform } from '../Actions/withdrawFaultCodeWaveform'
import { fixVehicleLine } from './FixPhotos'
import { WaveformChart } from './WaveformChart'
import {
  hasImage,
  KindBadge,
  type ListedWaveform,
  useConditionLabel,
  waveformFileUrl,
} from './WaveformParts'

const FILE_ICONS: Record<Exclude<WaveformFileRole, 'image'>, typeof Waves> = {
  psdata: Waves,
  pssettings: Settings2,
  csv: FileSpreadsheet,
}

/** "Norwegian" for nb, in the reader's language; null when it is the reader's own. */
function languageName(lang: string, locale: string): string | null {
  if (lang.toLowerCase() === locale.toLowerCase()) return null
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(lang) ?? null
  } catch {
    return null
  }
}

/**
 * One waveform, full size: the trace with each channel's value under the pointer, the
 * picture of the screen, what the technician noted, and the files to open in PicoScope.
 * "Compare with" draws another waveform for the code under it on the same width, the way a
 * technician holds a known good one against what the car shows.
 */
export function WaveformViewer({
  waveform: w,
  others,
  code,
  onOpenChange,
  onWithdrawn,
}: {
  waveform: ListedWaveform
  /** The code's other waveforms with something to draw, to compare against. */
  others: ListedWaveform[]
  code: string
  onOpenChange: (open: boolean) => void
  onWithdrawn: () => void
}) {
  const t = useTranslations('faultCodes.waveforms')
  const locale = useLocale()
  const isMarine = useServiceType() === 'marine'
  const confirm = useConfirm()
  const { formatDate } = useFormatDate()
  const conditionLabel = useConditionLabel()
  // A faulty one opens next to a known good one when there is one.
  const [compareId, setCompareId] = useState<string>(
    () =>
      (w.kind === 'faulty' ? others.find((o) => o.kind === 'good' && o.preview)?.id : null) ??
      'none'
  )
  const [withdrawing, setWithdrawing] = useState(false)
  const compare = others.find((o) => o.id === compareId) ?? null

  const withdraw = async () => {
    const ok = await confirm({
      title: t('withdrawTitle'),
      description: t('withdrawConfirm'),
      confirmLabel: t('withdraw'),
      destructive: true,
    })
    if (!ok) return
    setWithdrawing(true)
    const result = await withdrawFaultCodeWaveform({ code, id: w.id })
    setWithdrawing(false)
    if (!result.success) {
      toast.error(t('withdrawFailed'))
      return
    }
    toast.success(t('withdrawn'))
    onWithdrawn()
  }

  const vehicleLine = fixVehicleLine(w.vehicle)
  const language = languageName(w.lang, locale)
  const downloads = w.files.filter(
    (f): f is typeof f & { role: Exclude<WaveformFileRole, 'image'> } => f.role !== 'image'
  )
  const order: Record<string, number> = { psdata: 0, csv: 1, pssettings: 2 }
  downloads.sort((a, b) => order[a.role] - order[b.role])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={w.kind} />
            {w.own && w.status && w.status !== 'published' && (
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t(`status.${w.status}`)}
              </span>
            )}
          </div>
          <DialogTitle>{w.title}</DialogTitle>
          <DialogDescription>
            {[
              w.condition ? conditionLabel(w.condition) : null,
              vehicleLine ?? (isMarine ? t('unknownVehicleMarine') : t('unknownVehicle')),
              t('sharedOn', { date: formatDate(w.createdAt) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {w.own && w.status === 'rejected' && w.reason && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              {t('reason', { reason: w.reason })}
            </p>
          )}

          <Trace waveform={w} />

          {others.length > 0 && (
            <section className="space-y-3" aria-label={t('compare.label')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t('compare.label')}</span>
                <Select
                  value={compareId}
                  onValueChange={(next) => {
                    if (next !== 'none') {
                      const other = others.find((o) => o.id === next)
                      track('fault_code:waveform_compare', {
                        code,
                        kinds: `${w.kind}+${other?.kind ?? 'unknown'}`,
                      })
                    }
                    setCompareId(next)
                  }}
                >
                  <SelectTrigger className="h-8 w-auto min-w-56 max-w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('compare.none')}</SelectItem>
                    {others.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {t(`kind.${o.kind}`)} · {o.title}
                        {fixVehicleLine(o.vehicle) ? ` · ${fixVehicleLine(o.vehicle)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {compare && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => setCompareId('none')}
                  >
                    <X />
                    {t('compare.close')}
                  </Button>
                )}
              </div>
              {compare && (
                <div className="space-y-2 rounded-lg border border-card-edge bg-muted/15 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <KindBadge kind={compare.kind} />
                    <span className="font-medium">{compare.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        compare.condition ? conditionLabel(compare.condition) : null,
                        fixVehicleLine(compare.vehicle),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <Trace key={compare.id} waveform={compare} />
                </div>
              )}
            </section>
          )}

          {w.note && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-medium">{t('note')}</h3>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{w.note}</p>
              {language && (
                <p className="text-xs text-muted-foreground">{t('writtenIn', { language })}</p>
              )}
            </section>
          )}

          {downloads.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('files.title')}</h3>
              <ul className="grid gap-2 sm:grid-cols-3">
                {downloads.map((f) => {
                  const Icon = FILE_ICONS[f.role]
                  return (
                    <li key={f.role}>
                      <a
                        href={waveformFileUrl(w.id, f.role)}
                        download={f.name}
                        onClick={() =>
                          track('fault_code:waveform_download', {
                            code,
                            role: f.role,
                            kind: w.kind,
                          })
                        }
                        className="flex items-center gap-3 rounded-lg border border-card-edge px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{t(`files.${f.role}`)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {f.name} · {formatBytes(f.size)}
                          </span>
                        </span>
                        <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </a>
                    </li>
                  )
                })}
              </ul>
              {downloads.some((f) => f.role === 'psdata') && (
                <p className="text-xs text-muted-foreground">{t('files.openHint')}</p>
              )}
            </section>
          )}
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          {w.own ? (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={withdrawing}
              onClick={() => void withdraw()}
            >
              {withdrawing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t('withdraw')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The trace when there is a CSV export, the picture of the screen when there is one, and a
 * switch between them when there are both. The picture opens full size in a new tab.
 */
function Trace({ waveform: w }: { waveform: ListedWaveform }) {
  const t = useTranslations('faultCodes.waveforms')
  const image = hasImage(w)
  const [view, setView] = useState<'trace' | 'picture'>(w.preview ? 'trace' : 'picture')
  if (!w.preview && !image) {
    return <p className="text-sm text-muted-foreground">{t('nothingToDraw')}</p>
  }
  return (
    <div className="space-y-2">
      {w.preview && image && (
        <div
          className="inline-flex rounded-md border border-card-edge bg-muted/30 p-0.5"
          role="group"
          aria-label={t('view.label')}
        >
          {(['trace', 'picture'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                view === v && 'bg-background text-foreground shadow-sm'
              )}
            >
              {v === 'trace' ? (
                <Activity className="size-3.5" aria-hidden />
              ) : (
                <ImageIcon className="size-3.5" aria-hidden />
              )}
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      )}
      {view === 'trace' && w.preview ? (
        <WaveformChart preview={w.preview} />
      ) : (
        <a
          href={waveformFileUrl(w.id, 'image')}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border border-card-edge bg-muted transition-opacity hover:opacity-95"
          aria-label={t('openPicture')}
        >
          <img
            src={waveformFileUrl(w.id, 'image')}
            alt=""
            className="max-h-[28rem] w-full object-contain"
          />
        </a>
      )}
    </div>
  )
}
