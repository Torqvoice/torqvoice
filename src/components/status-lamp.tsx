import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type LampTone = 'slate' | 'teal' | 'blue' | 'violet' | 'green' | 'amber' | 'red'

/** The dot and its halo for each tone. The halo is the same colour, faint. */
const DOT: Record<LampTone, string> = {
  slate: 'bg-slate-500 ring-slate-500/20',
  teal: 'bg-teal-600 ring-teal-600/20',
  blue: 'bg-blue-600 ring-blue-600/20',
  violet: 'bg-violet-600 ring-violet-600/20',
  green: 'bg-emerald-600 ring-emerald-600/20',
  amber: 'bg-amber-500 ring-amber-500/25',
  red: 'bg-red-600 ring-red-600/20',
}

/**
 * A status as a small lit dot and a word, instead of a tinted pill. Quieter
 * in a list than a row of coloured badges, and the colour still reads at a
 * glance. Without children it is the dot alone, for places where the word is
 * already said next to it.
 */
export function StatusLamp({
  tone,
  children,
  className,
}: {
  tone: LampTone
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-foreground/80',
        className
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full ring-[3px]', DOT[tone])} />
      {children}
    </span>
  )
}

/**
 * The tone for a work order's stored status. Waiting statuses are grey,
 * booked is teal, work under way is blue, parts on order violet, done green.
 * A status the workshop added itself, or one this list does not know yet,
 * is grey rather than a guess.
 */
export function serviceStatusTone(status: string): LampTone {
  switch (status) {
    case 'scheduled':
      return 'teal'
    case 'in-progress':
    case 'in_progress':
      return 'blue'
    case 'waiting-parts':
    case 'waiting_parts':
      return 'violet'
    case 'completed':
      return 'green'
    default:
      return 'slate'
  }
}
