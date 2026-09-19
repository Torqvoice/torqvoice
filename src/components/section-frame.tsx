'use client'

import type { ComponentType, ReactNode } from 'react'
import { AppCard } from '@/components/app-card'
import { useModernWorkOrder } from '@/components/work-order-layout-context'

/**
 * One section, two frames. On the classic work order page (and on the quote
 * page, and anywhere else with no layout provider) it draws exactly what the
 * section drew before: the caller's own wrapper classes and its own header,
 * untouched. On the overhauled page the same children sit in the house card.
 *
 * The children are the same nodes either way, which is the point: a field
 * lives in one component, so both layouts save the same form.
 */
export function SectionFrame({
  className,
  header,
  icon,
  title,
  badge,
  description,
  action,
  modernClassName,
  contentClassName,
  testId,
  children,
}: {
  /** The classic wrapper's classes, as they were. */
  className: string
  /** The classic header, as it was. */
  header: ReactNode
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  badge?: ReactNode
  description?: ReactNode
  action?: ReactNode
  modernClassName?: string
  contentClassName?: string
  testId?: string
  children: ReactNode
}) {
  const modern = useModernWorkOrder()

  if (modern) {
    return (
      <div data-testid={testId}>
        <AppCard
          icon={icon}
          title={title}
          badge={badge}
          description={description}
          action={action}
          className={modernClassName}
          contentClassName={contentClassName}
        >
          {children}
        </AppCard>
      </div>
    )
  }

  return (
    <div className={className} data-testid={testId}>
      {header}
      {children}
    </div>
  )
}
