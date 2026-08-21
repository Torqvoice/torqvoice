import type { ComponentType } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A headline number that links somewhere. The dashboard's top row.
 *
 * Built to the same rules as {@link AppCard}: the icon chip is the light
 * source, the border leans primary on hover, and the shadow is a crisp seat
 * plus a soft drop rather than a flat grey smudge. The number carries the
 * weight — it is the first thing read on the page — and the arrow only
 * appears on hover or focus, so the tile stays quiet until pointed at.
 *
 * `tone="warning"` is for a count that means someone has to act (parts below
 * their reorder point), not merely a large number.
 */
export function StatTile({
  href,
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  href: string
  label: string
  value: number | string
  icon: ComponentType<{ className?: string }>
  tone?: 'default' | 'warning'
}) {
  const warning = tone === 'warning'
  return (
    <Link
      href={href}
      className={cn(
        'group/tile flex items-center gap-3 rounded-xl border bg-card px-4 py-3',
        'shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]',
        'transition-[border-color,box-shadow] duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        warning
          ? 'border-amber-500/30 bg-amber-50 hover:border-amber-500/50 dark:bg-amber-950/40'
          : 'border-card-edge hover:border-primary/30 hover:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_16px_40px_-16px_rgb(0_0_0/0.22)]'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-b ring-1 ring-inset shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]',
          warning
            ? 'from-amber-500/18 to-amber-500/6 text-amber-600 ring-amber-500/25 dark:text-amber-500'
            : 'from-primary/12 to-primary/4 text-primary ring-primary/20'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-[11px] font-medium',
            warning ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            'text-2xl font-semibold leading-tight tabular-nums',
            warning && 'text-amber-700 dark:text-amber-500'
          )}
        >
          {value}
        </p>
      </div>
      <ArrowUpRight
        aria-hidden
        className={cn(
          'ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity duration-200',
          'group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100',
          warning ? 'text-amber-600/70' : 'text-muted-foreground'
        )}
      />
    </Link>
  )
}
