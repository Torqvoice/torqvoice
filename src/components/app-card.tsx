import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The house card. One look for every panel in the app: an icon chip in the
 * theme colour, a title block, an optional action on the right, and a hairline
 * under the header that starts in primary and fades out. Compose the inside
 * freely — lists pass `contentClassName="p-0"` and draw their own rows.
 *
 * The content region carries data-slot="app-card-content": the dashboard
 * grid's CSS targets it as the scroll area, so the footer stays pinned below
 * a scrolling list instead of becoming the scroll area itself.
 */
export function AppCard({
  icon: Icon,
  title,
  description,
  action,
  subheader,
  footer,
  children,
  className,
  contentClassName,
}: {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  /** One quiet line under the title. */
  description?: ReactNode
  /** Right-aligned header slot: an icon button, a "view all" link. */
  action?: ReactNode
  /** Full-width row between the title block and the hairline (tabs, filters). */
  subheader?: ReactNode
  /** Pinned strip under the content: a "view all" link, a total, a caption. */
  footer?: ReactNode
  children: ReactNode
  className?: string
  /** Overrides the content padding; lists that draw their own rows pass "p-0". */
  contentClassName?: string
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-card-edge bg-card text-card-foreground',
        // Two shadows instead of one: a crisp 1px seat and a soft, low drop.
        // Reads as depth rather than the flat grey smudge of shadow-sm.
        'shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]',
        // A faint primary wash across the top, behind the header. This is the
        // "sheen" that makes the card feel finished; at /5 it colours the
        // header area without ever reading as a painted band.
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-20 before:bg-linear-to-b before:from-primary/5 before:to-transparent',
        className
      )}
    >
      <div className="relative shrink-0">
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1 self-center">
            <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0 self-center">{action}</div>}
        </div>
        {subheader && <div className="px-5 pb-3">{subheader}</div>}
        {/* Signature hairline: primary under the chip, gone by the far edge. */}
        <div className="h-px bg-linear-to-r from-primary/40 via-card-edge to-transparent" />
      </div>
      <div data-slot="app-card-content" className={cn('min-h-0 flex-1 p-5 pt-4', contentClassName)}>
        {children}
      </div>
      {footer && (
        <div
          data-slot="app-card-footer"
          className="shrink-0 border-t border-card-edge/60 bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground"
        >
          {footer}
        </div>
      )}
    </div>
  )
}
