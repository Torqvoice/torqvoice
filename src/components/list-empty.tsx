import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The house empty state for a list page.
 *
 * Every list used to show one grey sentence and rely on the toolbar button,
 * which shrinks to an unlabeled plus icon on a phone. A workshop opening its
 * first empty list saw "No customers yet." and no visible way to change that,
 * and phones are where first-time visitors leave most.
 *
 * This puts the next step where the eye already is: an icon, the existing
 * empty-state sentence, and the same primary action as the toolbar, labelled
 * at every width. Only for the truly empty case. A search or filter miss
 * keeps its plain sentence, so a filtered list never looks like an empty shop.
 */
export function ListEmpty({
  icon: Icon,
  title,
  hint,
  action,
  secondary,
  bare = false,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  /** The page's existing empty sentence. */
  title: ReactNode
  /** One optional quiet line under the title. */
  hint?: ReactNode
  /** The primary next step, usually the same button as the toolbar. */
  action?: ReactNode
  /** An optional lesser path, such as an import link. */
  secondary?: ReactNode
  /** Inside a table cell the cell is the frame; skip the dashed border. */
  bare?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        !bare && 'rounded-lg border border-dashed',
        className
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="max-w-[36ch] text-xs text-muted-foreground">{hint}</p>}
      </div>
      {(action || secondary) && (
        <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
          {action}
          {secondary}
        </div>
      )}
    </div>
  )
}
