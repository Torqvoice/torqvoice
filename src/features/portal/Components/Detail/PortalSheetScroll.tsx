import type { ReactNode } from 'react'

/**
 * The frame around a printed sheet (invoice, quote) in the portal. The sheet
 * is paper: white in every theme, the dark one included, with the theme's
 * line and corner around it. It fits the width it is given; on a phone that
 * would shrink an A4 page to a thumbnail, so below the small breakpoint it
 * gets a readable width and the region scrolls sideways instead.
 */
export function PortalSheetScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      // Focusable so a keyboard can scroll it.
      tabIndex={0}
      className="overflow-x-auto rounded-[var(--p-radius)] border bg-white"
    >
      <div className="min-w-[640px] sm:min-w-0">{children}</div>
    </section>
  )
}
