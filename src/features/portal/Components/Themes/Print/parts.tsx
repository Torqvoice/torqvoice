/**
 * Small pieces the Print theme's three compositions share. Plain components
 * without hooks, so the home and the sign-in page (server) and the chrome
 * (client) can all use them.
 */

/** The portal's one container (its width and gutters), so every rule shares the inner pages' edges. */
export const PRINT_GUTTER = 'p-shell'

/** Small capitals over a column or beside a rule. */
export const PRINT_LABEL = 'p-label text-[11px] leading-4'

/** The heavy rule a section of the page hangs from. */
export const PRINT_RULE = 'border-t-2 border-[color:var(--p-ink)] pt-3.5'

/**
 * Print's mark before a line: a small square, as a printer's bullet. The
 * workshop's colour, or the open / closed colour before today's hours.
 * Decoration only: the words beside it carry the meaning.
 */
export function PrintMark({ tone = 'accent' }: { tone?: 'accent' | 'open' | 'closed' }) {
  const fill =
    tone === 'accent' ? 'var(--p-accent)' : tone === 'open' ? 'var(--p-open)' : 'var(--p-muted)'
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0" style={{ background: fill }} />
}

/** Whether the workshop is open, as a line with its mark. */
export function PrintOpenLine({
  open,
  children,
  className,
}: {
  open: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <PrintMark tone={open ? 'open' : 'closed'} />
      {children}
    </span>
  )
}
