/**
 * The portal's box: a surface with the theme's border and corner.
 *
 *   <PortalPanel aria-labelledby="to-pay">
 *     <PortalSectionLabel id="to-pay">To pay</PortalSectionLabel>
 *     …
 *   </PortalPanel>
 *
 * tone   surface  the ordinary card (default)
 *        soft     a quieter filled block, no border
 *        hero     the theme's band (dark in Daylight). Inside it the ordinary
 *                 primitives recolour themselves: labels, links, focus rings
 *                 and `.p-muted` text use the band's own colours.
 *        plain    no box at all: only groups content
 * flush  no padding and clipped corners, for a panel that holds a list or
 *        the chat edge to edge
 * as     the element: 'section' (default), 'div', 'article', 'aside', 'li'
 *
 * Padding is 16 px on a phone and 24 px from 640 px; a Tailwind padding class
 * in `className` replaces it.
 *
 * `PortalSectionLabel` is the small capital line that names a block. It is an
 * `h2` unless `as` says otherwise.
 */

type PanelTone = 'surface' | 'soft' | 'hero' | 'plain'

export function PortalPanel({
  tone = 'surface',
  flush = false,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: {
  tone?: PanelTone
  flush?: boolean
  as?: 'section' | 'div' | 'article' | 'aside' | 'li'
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className'>) {
  const classes = [
    'p-panel',
    tone !== 'surface' && `p-panel--${tone}`,
    flush && 'p-panel--flush',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag {...rest} className={classes}>
      {children}
    </Tag>
  )
}

export function PortalSectionLabel({
  as: Tag = 'h2',
  className,
  children,
  ...rest
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span'
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className'>) {
  return (
    <Tag {...rest} className={className ? `p-label ${className}` : 'p-label'}>
      {children}
    </Tag>
  )
}
