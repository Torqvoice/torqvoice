import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { statusBadgeClass, type StatusKind } from '@/lib/status-colors'
import { statusColorClasses } from '@/features/work-order-statuses/Lib/stages'
import { cn } from '@/lib/utils'

/**
 * A work order, quote or inspection status as a tinted pill, in the one
 * colour that status has everywhere (src/lib/status-colors.ts). The label is
 * the caller's, since each screen already has the translator for it.
 *
 * Every screen that shows one of these statuses draws it with this, so a
 * status cannot be yellow on one page and grey on the next.
 */
export function StatusBadge({
  kind,
  status,
  className,
  children,
}: {
  kind: StatusKind
  status: string
  className?: string
  children: ReactNode
}) {
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn('text-xs', statusBadgeClass(kind, status), className)}
    >
      {children}
    </Badge>
  )
}

/**
 * One of the workshop's own statuses ("Ready for pickup"), in the colour the
 * workshop gave it, shown beside the stage's badge.
 */
export function CustomStatusChip({
  status,
  className,
}: {
  status: { name: string; color: string }
  className?: string
}) {
  return (
    <span
      className={cn(
        'max-w-40 truncate rounded-full border px-2 py-0.5 text-xs font-medium',
        statusColorClasses(status.color).chip,
        className
      )}
    >
      {status.name}
    </span>
  )
}
