'use client'

import { useId, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { WaveformPreview } from '@/features/integrations/Lib/types'

/**
 * PicoScope's channel colours, A to H, in tones that read on light and dark alike. A technician
 * knows channel A as blue and B as red from the scope itself, so these follow the channel and
 * not the theme.
 */
const CHANNEL_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#94a3b8',
  '#06b6d4',
  '#ec4899',
]
const DIVISIONS_X = 10
const DIVISIONS_Y = 8
const WIDTH = 1000

/** Channel A is blue whatever its place in the export; one with no letter goes by its place. */
export function channelColor(name: string, index: number): string {
  const letter = /(?:^|\s)([A-H])$/i.exec(name.trim())?.[1]
  const at = letter ? letter.toUpperCase().charCodeAt(0) - 65 : index
  return CHANNEL_COLORS[at % CHANNEL_COLORS.length]
}

type Range = { lo: number; hi: number }

function rangeOf(channel: WaveformPreview['channels'][number]): Range | null {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const v of channel.min) if (v !== null && v < lo) lo = v
  for (const v of channel.max) if (v !== null && v > hi) hi = v
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  // A flat line sits in the middle rather than on an edge.
  if (hi - lo < 1e-9) return { lo: lo - 1, hi: hi + 1 }
  const pad = (hi - lo) * 0.08
  return { lo: lo - pad, hi: hi + pad }
}

/**
 * Each run of slices with samples as one shape: the highs left to right, the lows back, so a
 * square wave's edges and a spike's top both show at any width.
 */
function bandPaths(
  channel: WaveformPreview['channels'][number],
  range: Range,
  height: number
): string[] {
  const n = channel.min.length
  const step = WIDTH / n
  const y = (v: number) => height - ((v - range.lo) / (range.hi - range.lo)) * height
  const paths: string[] = []
  let run: number[] = []
  const flush = () => {
    if (run.length === 0) return
    const top = run.map((i) => `${(i * step).toFixed(1)},${y(channel.max[i] as number).toFixed(1)}`)
    const last = run[run.length - 1]
    top.push(`${((last + 1) * step).toFixed(1)},${y(channel.max[last] as number).toFixed(1)}`)
    const bottom = [...run]
      .reverse()
      .map((i) => `${(i * step).toFixed(1)},${y(channel.min[i] as number).toFixed(1)}`)
    bottom.unshift(`${((last + 1) * step).toFixed(1)},${y(channel.min[last] as number).toFixed(1)}`)
    paths.push(`M${top.join('L')}L${bottom.join('L')}Z`)
    run = []
  }
  for (let i = 0; i < n; i++) {
    if (channel.min[i] === null || channel.max[i] === null) flush()
    else run.push(i)
  }
  flush()
  return paths
}

/**
 * A scope recording drawn from its CSV export, the way the scope shows it: a grid of
 * divisions, each channel on its own scale in its own colour, the time across. `compact` is
 * the small one in a list; the full one names the channels, the time per division and, under
 * the pointer, each channel's value.
 */
export function WaveformChart({
  preview,
  compact = false,
  className,
}: {
  preview: WaveformPreview
  compact?: boolean
  className?: string
}) {
  const t = useTranslations('faultCodes.waveforms.chart')
  const locale = useLocale()
  const clip = useId()
  const height = compact ? 360 : 500
  const [hover, setHover] = useState<number | null>(null)

  const channels = useMemo(
    () =>
      preview.channels.flatMap((c, i) => {
        const range = rangeOf(c)
        if (!range) return []
        return [
          {
            ...c,
            color: channelColor(c.name, i),
            range,
            paths: bandPaths(c, range, height),
          },
        ]
      }),
    [preview, height]
  )

  const format = (v: number) =>
    new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(v)
  const unit = preview.timeUnit ? ` ${preview.timeUnit}` : ''
  const span = preview.end - preview.start
  const slices = preview.channels[0]?.min.length ?? 1

  return (
    <figure className={cn('min-w-0', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-card-edge bg-muted/25',
          compact ? 'aspect-[25/9]' : 'aspect-[2/1] sm:aspect-[5/2]'
        )}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          role="img"
          aria-label={t('label', {
            channels: channels.map((c) => c.name).join(', '),
            span: `${format(span)}${unit}`,
          })}
          onPointerMove={
            compact
              ? undefined
              : (e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const at = Math.floor(((e.clientX - box.left) / box.width) * slices)
                  setHover(Math.max(0, Math.min(slices - 1, at)))
                }
          }
          onPointerLeave={compact ? undefined : () => setHover(null)}
        >
          <clipPath id={clip}>
            <rect width={WIDTH} height={height} />
          </clipPath>
          <g className="text-border" stroke="currentColor" strokeWidth={1}>
            {Array.from({ length: DIVISIONS_X - 1 }, (_, i) => (
              <line
                key={`x${i}`}
                x1={((i + 1) * WIDTH) / DIVISIONS_X}
                x2={((i + 1) * WIDTH) / DIVISIONS_X}
                y1={0}
                y2={height}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {Array.from({ length: DIVISIONS_Y - 1 }, (_, i) => (
              <line
                key={`y${i}`}
                x1={0}
                x2={WIDTH}
                y1={((i + 1) * height) / DIVISIONS_Y}
                y2={((i + 1) * height) / DIVISIONS_Y}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={i === DIVISIONS_Y / 2 - 1 ? undefined : '2 4'}
              />
            ))}
          </g>
          <g clipPath={`url(#${clip})`}>
            {channels.map((c) =>
              c.paths.map((d, i) => (
                <path
                  key={`${c.name}-${i}`}
                  d={d}
                  fill={c.color}
                  fillOpacity={0.9}
                  stroke={c.color}
                  strokeWidth={compact ? 1.25 : 1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))
            )}
          </g>
          {hover !== null && (
            <line
              x1={((hover + 0.5) * WIDTH) / slices}
              x2={((hover + 0.5) * WIDTH) / slices}
              y1={0}
              y2={height}
              className="text-foreground"
              stroke="currentColor"
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {!compact && (
          <span className="pointer-events-none absolute right-2 bottom-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {t('perDivision', { value: `${format(span / DIVISIONS_X)}${unit}` })}
          </span>
        )}
      </div>

      {!compact && (
        <figcaption className="mt-2 space-y-1.5">
          <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>
              {format(preview.start)}
              {unit}
            </span>
            {hover !== null && (
              <span className="text-foreground">
                {format(preview.start + ((hover + 0.5) / slices) * span)}
                {unit}
              </span>
            )}
            <span>
              {format(preview.end)}
              {unit}
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {channels.map((c) => {
              const lo = hover !== null ? c.min[hover] : null
              const hi = hover !== null ? c.max[hover] : null
              const u = c.unit ? ` ${c.unit}` : ''
              return (
                <li key={c.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {hover !== null
                      ? lo === null || hi === null
                        ? t('noSample')
                        : lo === hi || Math.abs(hi - lo) < Math.abs(hi) * 0.01
                          ? `${format(hi)}${u}`
                          : t('between', { lo: `${format(lo)}${u}`, hi: `${format(hi)}${u}` })
                      : t('between', {
                          lo: `${format(Math.min(...(c.min.filter((v) => v !== null) as number[])))}${u}`,
                          hi: `${format(Math.max(...(c.max.filter((v) => v !== null) as number[])))}${u}`,
                        })}
                  </span>
                </li>
              )
            })}
          </ul>
        </figcaption>
      )}
    </figure>
  )
}
