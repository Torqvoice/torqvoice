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
 * A small lit dot and a word, for a condition that is not a document's
 * status: an inspection coming due, how serious an observation is, a reminder
 * that is late. Without children it is the dot alone, for places where the
 * word is already said next to it.
 *
 * Work order, quote and inspection statuses are never drawn with this. They
 * are `StatusBadge` (src/components/status-badge.tsx), in the one colour each
 * has across the app.
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
