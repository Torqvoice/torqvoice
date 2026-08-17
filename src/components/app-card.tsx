import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The house card. One look for every panel in the app: an icon chip in the
 * theme colour, a title block, an optional action on the right, and a hairline
 * under the header that starts in primary and fades out. Compose the inside
 * freely — lists pass `contentClassName="p-0"` and draw their own rows.
 *
 * The design conceit is that the chip is the card's light source: the sheen
 * is a radial glow centred on it, the chip face carries a top-lit gradient,
 * and the hairline is brightest directly beneath it. Hovering the card feeds
 * the light — glow, hairline and border all lift a step, smoothly. None of it
 * is load-bearing; every effect degrades to a plain bordered card.
 *
 * The content region carries data-slot="app-card-content": the dashboard
 * grid's CSS targets it as the scroll area, so the footer stays pinned below
 * a scrolling list instead of becoming the scroll area itself.
 */
export function AppCard({
  icon: Icon,
  title,
  badge,
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
  /** Small count pill after the title. Pass `list.length || undefined` to hide zeros. */
  badge?: ReactNode
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
        'group/card relative flex flex-col overflow-hidden rounded-xl border border-card-edge bg-card text-card-foreground',
        // Two shadows instead of one: a crisp 1px seat and a soft, low drop.
        // Reads as depth rather than the flat grey smudge of shadow-sm.
        'shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]',
        // Hover: the whole card wakes one step — deeper drop, edge leaning
        // primary. Deliberately smaller than the tiles' hover so containers
        // never read as buttons.
        'transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_16px_40px_-16px_rgb(0_0_0/0.22)]',
        // The sheen: a radial glow centred on the icon chip rather than a flat
        // band, so the header reads as lit by the chip. A second, brighter
        // pass fades in on hover — gradients can't transition, opacity can.
        // inset-0, not a fixed-height strip: the ellipse must finish its own
        // fade-out inside the layer, or its clip edge draws a hard line.
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_70%)]',
        'after:pointer-events-none after:absolute after:inset-0 after:opacity-0 after:transition-opacity after:duration-300 after:bg-[radial-gradient(9.5rem_6rem_at_2.75rem_2.5rem,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)] hover:after:opacity-100',
        className
      )}
    >
      <div className="relative shrink-0">
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-b from-primary/18 to-primary/6 text-primary ring-1 ring-inset ring-primary/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1 self-center">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="truncate">{title}</span>
              {badge != null && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary ring-1 ring-inset ring-primary/15">
                  {badge}
                </span>
              )}
            </h3>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0 self-center">{action}</div>}
        </div>
        {subheader && <div className="px-5 pb-3">{subheader}</div>}
        {/* Signature hairline: primary under the chip, gone by the far edge.
            The brighter copy fades in with the hover glow. */}
        <div className="relative h-px">
          <div className="absolute inset-0 bg-linear-to-r from-primary/40 via-card-edge to-transparent" />
          <div className="absolute inset-0 bg-linear-to-r from-primary/70 via-primary/15 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />
        </div>
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
