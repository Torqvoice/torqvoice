/**
 * Small marks.
 *
 *   <PortalBadge>In the workshop</PortalBadge>
 *   <PortalBadge tone="danger">Overdue</PortalBadge>
 *   <PortalPlate>EK 12345</PortalPlate>
 *   <PortalCount value={unread} label="1 unread message" />
 *   <PortalStatusDot tone="open" />
 *
 * `PortalBadge` tone: 'neutral' (default, the soft fill), 'accent' (the
 * workshop's colour), 'outline', 'danger'. One short phrase; it never wraps.
 *
 * `PortalPlate` sets a licence plate like one. `PortalCount` is the number on
 * a tab or an icon; it renders nothing for zero and reads `label` to a screen
 * reader. `PortalStatusDot` is the dot before "Open until 17:00": 'open',
 * 'closed' (default) or 'accent'; decoration only, the words carry the
 * meaning.
 */

export function PortalBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'outline' | 'danger'
  className?: string
  children: React.ReactNode
}) {
  const classes = ['p-badge', tone !== 'neutral' && `p-badge--${tone}`, className]
    .filter(Boolean)
    .join(' ')
  return <span className={classes}>{children}</span>
}

export function PortalPlate({ children }: { children: React.ReactNode }) {
  return <span className="p-plate">{children}</span>
}

export function PortalCount({
  value,
  label,
  className,
}: {
  value: number
  /** What the number means, for a screen reader: "1 unread message". */
  label: string
  className?: string
}) {
  if (value <= 0) return null
  return (
    <span className={className ? `p-count ${className}` : 'p-count'}>
      <span aria-hidden>{value > 99 ? '99+' : value}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function PortalStatusDot({ tone = 'closed' }: { tone?: 'open' | 'closed' | 'accent' }) {
  return <span aria-hidden className={tone === 'closed' ? 'p-dot' : `p-dot p-dot--${tone}`} />
}
