/**
 * Lists and what a list shows when it is empty.
 *
 *   <PortalListRow
 *     href={`/portal/${org}/vehicles/${car.id}`}
 *     title="Volvo V60"
 *     meta="EK 12345 · 8 visits"
 *     trailing={<PortalBadge>In the workshop</PortalBadge>}
 *   />
 *
 * `PortalListRow` is one line that goes somewhere: a title, a quieter line
 * under it, something on the right (a badge, an amount) and a chevron. With
 * `href` the whole row is the link; without, it is a plain row and has no
 * chevron. Rows draw a rule between themselves, so stack them directly in a
 * panel (`as="li"` inside a `<ul>` when the list is a list). At least 60 px
 * tall. Long titles wrap; they are never cut.
 *
 * `PortalEmptyState` says, in a sentence, that there is nothing here and what
 * to do about it. `title` in the display face, `children` as the quieter
 * line, `action` a button or link under it. `center` centres it in a tall
 * empty area; by default it sits where the content would, left-aligned.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export function PortalListRow({
  href,
  title,
  meta,
  trailing,
  as = 'div',
  className,
}: {
  href?: string
  title: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
  as?: 'div' | 'li'
  className?: string
}) {
  const inner = (
    <>
      <span className="p-row__body">
        <span className="p-row__title block">{title}</span>
        {meta && <span className="p-row__meta block">{meta}</span>}
      </span>
      {trailing}
      {href && <ChevronRight className="p-row__chevron h-[18px] w-[18px]" aria-hidden />}
    </>
  )
  const classes = className ? `p-row ${className}` : 'p-row'
  if (href) {
    const link = (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    )
    return as === 'li' ? <li>{link}</li> : link
  }
  const Tag = as
  return <Tag className={classes}>{inner}</Tag>
}

export function PortalEmptyState({
  title,
  children,
  action,
  center = false,
  className,
}: {
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  center?: boolean
  className?: string
}) {
  const classes = ['p-empty', center && 'p-empty--center', className].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <p className="p-empty__title">{title}</p>
      {children && <p className="p-empty__body">{children}</p>}
      {action && <div className="p-empty__action">{action}</div>}
    </div>
  )
}
