/**
 * The small marks Garage's three compositions share: its label and tag type,
 * the square dot, the plate and the action link. Plain functions and class
 * strings without hooks, so the server Home and the client Chrome can both
 * use them.
 *
 * The workshop's colour may be anything, light or dark, so it is only ever a
 * fill with `--p-on-accent` on it or a small mark (a square, a rule under a
 * link); words on the ground are always in the ink.
 */

/** A small capital line in the condensed face: "READY TODAY AROUND". Add `p-muted` where it is quiet. */
export const LABEL = 'p-display text-[15px] font-semibold leading-5 tracking-[0.12em]'

/** A filled or outlined word block: "IN THE WORKSHOP", "NOW". Add the fill or the border. */
export const TAG =
  'p-display inline-flex min-h-7 max-w-full items-center px-2.5 py-0.5 text-[15px] leading-tight tracking-[0.1em]'

/**
 * One cell of the board. Its side padding is the shared container's gutter
 * (`.p-shell`: 16 / 24 / 40 px), so what a cell holds lines up with the header
 * and with the inner pages while the rules between cells run on to the edge.
 */
export const CELL = 'flex min-w-0 flex-col px-4 py-5 sm:px-6 lg:px-10 @[760px]:py-7'

/** A link that reads as an action: capitals in the ink, 44 px tall. Wrap its words in `ACTION_RULE`. */
export const ACTION =
  'p-display inline-flex min-h-11 max-w-full items-center gap-2 self-start rounded-[2px] text-[17px] tracking-[0.08em] text-[color:var(--p-ink)] no-underline'

/** The rule under an action link's words, in the workshop's colour. */
export const ACTION_RULE = 'border-b-2 border-[color:var(--p-accent)] pb-0.5'

/** The board's dot is a square: before "Open until 17:00", a label, an unread line. */
export function SquareDot({
  tone = 'muted',
  large,
}: {
  tone?: 'muted' | 'accent' | 'open' | 'danger'
  large?: boolean
}) {
  const fill =
    tone === 'accent'
      ? 'bg-[var(--p-accent)]'
      : tone === 'open'
        ? 'bg-[var(--p-open)]'
        : tone === 'danger'
          ? 'bg-[var(--p-danger)]'
          : 'bg-[var(--p-muted)]'
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${large ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${fill}`}
    />
  )
}

/** A licence plate as the board sets one: outlined, condensed, spaced. */
export function Plate({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={`p-display inline-flex shrink-0 items-center whitespace-nowrap border border-[color:var(--p-line-strong)] font-semibold tracking-[0.1em] ${
        small ? 'h-[22px] px-1.5 text-[15px]' : 'h-[26px] px-2 text-[17px]'
      }`}
    >
      {children}
    </span>
  )
}
