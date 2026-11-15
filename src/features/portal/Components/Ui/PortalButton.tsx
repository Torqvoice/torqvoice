/**
 * The portal's buttons. Colours, shape and type come from the theme's
 * variables (`.p-btn` in portal-themes.css); never use the app's `Button`.
 *
 *   <PortalButton variant="accent" onClick={…}>Accept quote</PortalButton>
 *   <PortalLinkButton variant="outline" href={url}>Read the quote</PortalLinkButton>
 *   <PortalIconButton label="Call Fjordside Auto" href="tel:…"><Phone /></PortalIconButton>
 *
 * variant  accent   the workshop's colour: the one main action of a block
 *          strong   filled in the ink: a second main action ("Pay now")
 *          outline  bordered, on the surface: the quiet alternative (default)
 *          ghost    no box until hovered: tertiary
 *          hero     for use inside a hero panel
 * size     'md' (46 px, default) | 'lg' (56 px: the one button of a form)
 * block    full width
 * pending  shows a spinner and disables the button
 *
 * `PortalLinkButton` takes `href`; an address that starts with "/" is a
 * client-side link, anything else (tel:, https:) a plain anchor, and
 * `external` opens it in a new tab. `PortalIconButton` is a 44 px round
 * button or link holding one icon; `label` is required and is its name for a
 * screen reader. `portalButtonClass()` gives the same look to anything else.
 */
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export type PortalButtonVariant = 'accent' | 'strong' | 'outline' | 'ghost' | 'hero'
export type PortalButtonSize = 'md' | 'lg'

interface Look {
  variant?: PortalButtonVariant
  size?: PortalButtonSize
  block?: boolean
  className?: string
}

export function portalButtonClass({ variant = 'outline', size = 'md', block, className }: Look) {
  return [
    'p-btn',
    `p-btn--${variant}`,
    size === 'lg' && 'p-btn--lg',
    block && 'p-btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

export function PortalButton({
  variant,
  size,
  block,
  pending = false,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: Look & { pending?: boolean } & Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'className'
  >) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={portalButtonClass({ variant, size, block, className })}
    >
      {pending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

const isInternal = (href: string) => href.startsWith('/')

export function PortalLinkButton({
  variant,
  size,
  block,
  className,
  href,
  external = false,
  children,
  ...rest
}: Look & { href: string; external?: boolean } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    'className' | 'href'
  >) {
  const classes = portalButtonClass({ variant, size, block, className })
  if (isInternal(href) && !external) {
    return (
      <Link {...rest} href={href} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <a
      {...rest}
      href={href}
      className={classes}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

export type PortalIconButtonVariant = 'outline' | 'accent' | 'ghost'

type IconButtonBase = {
  /** The button's name for a screen reader. Required: an icon says nothing. */
  label: string
  variant?: PortalIconButtonVariant
  className?: string
  children: React.ReactNode
}

export function PortalIconButton(
  props:
    | (IconButtonBase & { href: string; external?: boolean })
    | (IconButtonBase &
        Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
          href?: undefined
        })
) {
  const { label, variant = 'outline', className, children } = props
  const classes = ['p-iconbtn', variant !== 'outline' && `p-iconbtn--${variant}`, className]
    .filter(Boolean)
    .join(' ')
  if (props.href !== undefined) {
    const { href, external } = props
    if (isInternal(href) && !external) {
      return (
        <Link href={href} aria-label={label} className={classes}>
          {children}
        </Link>
      )
    }
    return (
      <a
        href={href}
        aria-label={label}
        className={classes}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }
  const {
    label: _label,
    variant: _variant,
    className: _class,
    children: _children,
    href: _href,
    type = 'button',
    ...rest
  } = props
  return (
    <button {...rest} type={type} aria-label={label} className={classes}>
      {children}
    </button>
  )
}
