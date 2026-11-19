'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'
import { cn } from '@/lib/utils'
import { isLowerReading } from '../Lib/vehicleReading'

interface LowerReadingNoticeProps {
  /** What is in the reading field right now. */
  entered: string
  /** The last known reading; nothing is said without one. */
  last: number | null | undefined
  /** "km" or "mi", where the caller knows it. */
  unit?: string
  id?: string
  className?: string
}

/**
 * Says that the reading being typed is below the last known one. It never
 * stops a save: odometers are replaced and typos are corrected. Renders
 * nothing at all otherwise, so a reading that goes up changes nothing.
 */
export function LowerReadingNotice({
  entered,
  last,
  unit,
  id,
  className,
}: LowerReadingNoticeProps) {
  const t = useTranslations('vehicles.form')
  const format = useFormatter()
  const isMarine = useServiceType() === 'marine'
  if (last == null || !isLowerReading(entered, last)) return null
  const reading = format.number(last)
  return (
    <p
      id={id}
      role="status"
      data-testid="lower-reading-notice"
      className={cn('text-xs text-amber-600 dark:text-amber-500', className)}
    >
      {isMarine
        ? t('lowerReadingMarine', { hours: reading })
        : t('lowerReading', { reading: unit ? `${reading} ${unit}` : reading })}
    </p>
  )
}
