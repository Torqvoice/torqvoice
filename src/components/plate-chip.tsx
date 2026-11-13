import { cn } from '@/lib/utils'

/**
 * A registration plate, drawn the way a plate looks: a framed, monospaced
 * code. Wherever a vehicle appears it gets one, so the eye finds the car
 * before it reads the rest of the row.
 *
 * Neutral on purpose. No country band or colour: plates differ by country
 * and the app has no business guessing which one a workshop is in.
 */
export function PlateChip({
  plate,
  size = 'sm',
  className,
}: {
  plate: string
  size?: 'sm' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap border-foreground bg-background font-mono font-semibold uppercase leading-none text-foreground',
        size === 'lg'
          ? 'rounded-md border-2 px-3 py-2 text-xl tracking-[0.08em]'
          : 'rounded-[4px] border-[1.5px] px-1.5 py-1 text-xs tracking-wider',
        className
      )}
    >
      {plate}
    </span>
  )
}
