'use client'

import { cn } from '@/lib/utils'

interface FieldRowProps {
  /** Column name, shown beside the control while the table is stacked. */
  label: string
  /** Optional explanation, surfaced on hover of the label. */
  hint?: string
  className?: string
  children: React.ReactNode
}

/**
 * One cell of a line-item editor (parts, labor, quote lines).
 *
 * Below `lg` the editors stack into cards, where a bare column of number
 * inputs gives no clue which box is the price and which is the markup, so each
 * control keeps its column name beside it. From `lg` up the wrapper collapses
 * to `display: contents` and the control drops straight into the parent grid,
 * under the shared header row.
 */
export function FieldRow({ label, hint, className, children }: FieldRowProps) {
  return (
    <div className={cn('flex items-center gap-2 lg:contents', className)}>
      <span className="w-24 shrink-0 text-xs text-muted-foreground lg:hidden" title={hint}>
        {label}
      </span>
      {children}
    </div>
  )
}
