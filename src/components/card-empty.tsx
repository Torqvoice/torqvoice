import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The house empty state for an AppCard body.
 *
 * A dashboard card keeps its grid height whether or not it has rows, so an
 * empty one used to be several hundred pixels of nothing with a single grey
 * sentence pinned to the top-left. This centres the message in whatever space
 * the card has and gives it a muted icon and, where there is something useful
 * to do next, one action.
 *
 * Sized to fit a collapsed card (3 grid rows) without scrolling: keep the icon
 * chip at 2.5rem and the action at `size="sm"`.
 */
export function CardEmpty({
  icon: Icon,
  title,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  /** One quiet line. Reuse the card's existing `noData` string. */
  title: ReactNode
  /** Optional single next step, e.g. a "New inspection" button. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col items-center justify-center gap-2.5 px-5 py-6 text-center',
        className
      )}
    >
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="max-w-[28ch] text-xs text-muted-foreground">{title}</p>
      {action}
    </div>
  )
}
