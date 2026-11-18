import type { LucideIcon } from 'lucide-react'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { PortalSectionLabel } from '../../Ui'

/**
 * What Colour's three compositions share: the class strings for its colour
 * field, its deeper tone and its warm highlight, and a few small marks.
 * Plain functions without hooks, so the server Home and SignIn and the
 * client Chrome can all use them.
 *
 * The workshop's colour may be anything, light or dark. So it is only ever a
 * fill with `--p-on-accent` on it; the deeper tone and the quiet words on it
 * are mixed from the accent in the theme's block of `portal-themes.css`
 * (`--pc-*`), and words on white are always the ink.
 */

/** The colour field: the workshop's colour, its ink, and a focus ring that shows on it. */
export const FIELD =
  'bg-[var(--p-accent)] text-[color:var(--p-on-accent)] [--p-focus:var(--p-on-accent)]'

/** A shape in the deeper tone, on the field. Words on it are the field's ink. */
export const DEEP = 'border border-[color:var(--pc-deep-edge)] bg-[var(--pc-deep)]'

/** Quiet words on the deeper tone (never straight on the field). */
export const SOFT_ON_DEEP = 'text-[color:var(--pc-soft-on-deep)]'

/**
 * The warm highlight as a panel: what waits on the customer. Inside it the
 * ordinary names mean the highlight's own colours, so a button, a link and
 * `.p-muted` placed there are right as they are.
 */
export const HIGHLIGHT =
  'bg-[var(--pc-highlight)] text-[color:var(--pc-on-highlight)] [--p-ink:var(--pc-on-highlight)] [--p-muted:var(--pc-highlight-muted)] [--p-surface:transparent] [--p-line-strong:var(--pc-on-highlight)] [--p-strong:var(--pc-on-highlight)] [--p-focus:var(--pc-on-highlight)]'

/** The highlight as a small mark: put it on a `PortalCount` or a pill. */
export const HIGHLIGHT_MARK =
  '[--p-accent:var(--pc-highlight)] [--p-on-accent:var(--pc-on-highlight)]'

/** An icon button sitting on the field: the deeper tone with the field's ink. */
export const FIELD_ICON_BUTTON =
  'rounded-[14px] font-extrabold [--p-surface:var(--pc-deep)] [--p-soft:var(--pc-deep)] [--p-ink:var(--p-on-accent)] [--p-line:var(--pc-deep-edge)] [--p-focus:var(--p-on-accent)]'

/** A white panel of the home: no edge, and a slightly tighter corner on a phone. */
export const PANEL = 'flex flex-[1_1_260px] flex-col max-sm:rounded-[24px]'

/** A row inside a white panel that stands as its own soft tile. */
export const TILE =
  'flex min-h-[60px] items-center gap-2 rounded-[16px] bg-[var(--p-soft)] px-4 py-2.5'

/**
 * The workshop's mark where it stands on the field: the letter is cut out
 * of the field's ink, not drawn in the workshop's colour on itself.
 */
export function FieldMark({
  name,
  logoUrl,
  size,
}: {
  name: string
  logoUrl: string | null
  size: number
}) {
  return (
    <span className="flex shrink-0 [--p-accent:var(--pc-on-field)] [--p-on-accent:var(--pc-field)]">
      <PortalWorkshopMark name={name} logoUrl={logoUrl} size={size} />
    </span>
  )
}

/**
 * The dot before "Open until 17:00" on the field. It sits on a disc of the
 * field's ink so it shows on any colour; the words carry the meaning.
 */
export function FieldOpenDot({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--p-on-accent)]"
    >
      <span
        className={`h-2 w-2 rounded-full ${open ? 'bg-[var(--p-open)]' : 'bg-[var(--p-bar-off)]'}`}
      />
    </span>
  )
}

/**
 * The head of a white panel: a small tile in the workshop's colour holding
 * an icon, the panel's name, and something on the right (a date, a car).
 * `plain` draws the icon bare, for a panel that is itself a colour.
 */
export function PanelHead({
  id,
  icon: Icon,
  label,
  aside,
  plain = false,
}: {
  id: string
  icon: LucideIcon
  label: React.ReactNode
  aside?: React.ReactNode
  plain?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {/* The icon and the name never give way: `flex-[1_0_auto]` keeps them at
          the width of their words (a name longer than the panel wraps between
          words). What stands beside them goes to a line of its own when the
          two do not fit, and is cut short there if it is still too long. */}
      <div data-panel-head-label className="flex max-w-full flex-[1_0_auto] items-center gap-2.5">
        {plain ? (
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--p-accent)] text-[color:var(--p-on-accent)]"
          >
            <Icon className="h-4 w-4" strokeWidth={2.4} />
          </span>
        )}
        <PortalSectionLabel id={id} className="text-sm font-extrabold text-[color:var(--p-ink)]">
          {label}
        </PortalSectionLabel>
      </div>
      {aside ? (
        <div data-panel-head-aside className="flex min-w-0 max-w-full items-center [&>*]:min-w-0">
          {aside}
        </div>
      ) : null}
    </div>
  )
}
