'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'
import { cn } from '@/lib/utils'
import { readingNotice } from '../Lib/vehicleReading'

interface ReadingNoticeProps {
  /** What is in the reading field right now. */
  entered: string
  /** The last known reading; nothing is said without one. */
  last: number | null | undefined
  /** "km" or "mi", where the caller knows it. */
  unit?: string
  id?: string
  className?: string
}

/** Which notice the reading field shows, for its aria-describedby. */
export function useReadingNotice(entered: string, last: number | null | undefined) {
  const isMarine = useServiceType() === 'marine'
  return readingNotice(entered, last, isMarine ? 'hours' : 'distance')
}

/**
 * Says that the reading being typed is below the last known one, or so far
 * above it that a digit may have slipped in. It never stops a save:
 * odometers are replaced and typos are corrected. Renders nothing at all
 * otherwise, so a reading that goes up by a normal amount changes nothing.
 */
export function ReadingNotice({ entered, last, unit, id, className }: ReadingNoticeProps) {
  const t = useTranslations('vehicles.form')
  const format = useFormatter()
  const isMarine = useServiceType() === 'marine'
  const notice = useReadingNotice(entered, last)
  if (last == null || notice == null) return null
  const reading = format.number(last)
  const key = notice === 'lower' ? 'lowerReading' : 'muchHigherReading'
  return (
    <p
      id={id}
      role="status"
      data-testid={notice === 'lower' ? 'lower-reading-notice' : 'higher-reading-notice'}
      className={cn('text-xs text-amber-600 dark:text-amber-500', className)}
    >
      {isMarine
        ? t(`${key}Marine`, { hours: reading })
        : t(key, { reading: unit ? `${reading} ${unit}` : reading })}
    </p>
  )
}
