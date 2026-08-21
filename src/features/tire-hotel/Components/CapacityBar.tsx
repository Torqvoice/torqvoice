'use client'

import { useTranslations } from 'next-intl'
import { OCCUPANCY_TOKENS, occupancyBand } from '../Lib/tireConstants'
import { cn } from '@/lib/utils'

/**
 * How full one location or warehouse is, as a bar plus the two numbers that
 * matter: what is on it now and what still fits. The free count is the one
 * staff actually act on, so it gets the emphasis rather than the percentage.
 */
export function CapacityBar({
  used,
  capacity,
  free,
  showLabel = true,
  size = 'default',
  className,
}: {
  used: number
  capacity: number
  free: number
  showLabel?: boolean
  size?: 'sm' | 'default'
  className?: string
}) {
  const t = useTranslations('tireHotel')
  const band = occupancyBand(used, capacity)
  const tokens = OCCUPANCY_TOKENS[band]
  const percent = capacity > 0 ? Math.min(100, (used / capacity) * 100) : used > 0 ? 100 : 0

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-muted',
          size === 'sm' ? 'h-1.5' : 'h-2'
        )}
        role="meter"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label={t('capacity.meterLabel', { used, capacity })}
      >
        <div className={cn('h-full transition-all', tokens.bar)} style={{ width: `${percent}%` }} />
      </div>
      {showLabel && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {t('capacity.used', { used, capacity })}
          </span>
          <span className={cn('font-medium tabular-nums', tokens.text)}>
            {band === 'over'
              ? t('capacity.over', { count: used - capacity })
              : t('capacity.free', { count: free })}
          </span>
        </div>
      )}
    </div>
  )
}
