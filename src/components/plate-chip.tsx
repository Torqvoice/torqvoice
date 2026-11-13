'use client'

import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCopy } from '@/components/copy-value'
import { cn } from '@/lib/utils'

const SIZE = {
  sm: { plate: 'h-[22px] rounded-[4px] p-[1.5px]', band: 'w-[6px]', text: 'px-1.5 text-[14px]' },
  md: { plate: 'h-[34px] rounded-[6px] p-[2px]', band: 'w-[10px]', text: 'px-2.5 text-[21px]' },
  lg: { plate: 'h-[44px] rounded-[7px] p-[2.5px]', band: 'w-[13px]', text: 'px-3 text-[28px]' },
} as const

/**
 * Plate typefaces are condensed and drawn from DIN; Barlow Condensed is
 * loaded app-wide and comes from the same family of road-sign lettering.
 */
const PLATE_FONT: CSSProperties = {
  fontFamily: 'var(--font-barlow-condensed), var(--font-geist-mono), ui-monospace, monospace',
}

/**
 * A registration plate, drawn as one: a white face in a dark rim with a fine
 * inner line, a band at the left edge and condensed lettering. It stays white
 * in dark mode and every colour theme on purpose: it is the picture of a
 * physical plate, not a piece of the interface, which is why its colours are
 * fixed rather than theme tokens.
 *
 * The band carries no flag or country code. Plates differ by country and the
 * app has no business guessing which one a workshop is in.
 *
 * With `copyLabel` a click copies the plate, which is what gets typed into
 * parts catalogues and registries.
 */
export function PlateChip({
  plate,
  size = 'sm',
  copyLabel,
  className,
}: {
  plate: string
  size?: keyof typeof SIZE
  /** Names the plate for the copy button; leave out for a plate that only shows. */
  copyLabel?: string
  className?: string
}) {
  const s = SIZE[size]
  const frame = cn(
    'relative inline-flex shrink-0 items-stretch bg-neutral-900 align-middle shadow-[0_1px_2px_rgb(0_0_0/0.18)]',
    s.plate,
    className
  )
  const face = (copied?: boolean, copiedLabel?: string) => (
    <span className="flex items-stretch overflow-hidden rounded-[inherit] bg-white ring-1 ring-inset ring-black/15">
      <span aria-hidden className={cn('shrink-0 bg-[#1f4fae]', s.band)} />
      <span
        style={PLATE_FONT}
        className={cn(
          'relative flex items-center whitespace-nowrap font-semibold uppercase leading-none tracking-[0.05em] text-neutral-900',
          s.text
        )}
      >
        <span className={cn(copied && 'invisible')}>{plate}</span>
        {copied && (
          <span className="absolute inset-0 flex items-center justify-center gap-1 font-sans text-xs font-medium normal-case tracking-normal text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {copiedLabel}
          </span>
        )}
      </span>
    </span>
  )

  if (!copyLabel) return <span className={frame}>{face()}</span>
  return <CopyablePlate plate={plate} label={copyLabel} frame={frame} face={face} />
}

function CopyablePlate({
  plate,
  label,
  frame,
  face,
}: {
  plate: string
  label: string
  frame: string
  face: (copied?: boolean, copiedLabel?: string) => React.ReactNode
}) {
  const t = useTranslations('service.modern.vehicleInfo')
  const { copied, copy } = useCopy(plate)
  const name = copied ? t('copied') : t('copy', { label })
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={name}
      title={name}
      className={cn(
        frame,
        'cursor-copy transition-shadow hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {face(copied, t('copied'))}
    </button>
  )
}
