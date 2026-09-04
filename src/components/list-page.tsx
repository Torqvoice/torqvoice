'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Body of a list page: it ends at the bottom of the window instead of growing
 * with its rows, so the list scrolls inside itself and the page around it
 * (header, toolbar, pagination) never moves.
 *
 * Height is measured from wherever the element actually starts rather than
 * assumed, because the chrome above it is not fixed: an update notice or a
 * licence warning pushes the whole page down, and a guessed offset would leave
 * the pagination row hanging below the fold. The CSS fallback covers the first
 * paint (the 4rem header, plus on phones the 3.5rem bottom nav strip the app
 * layout reserves) so nothing jumps once the measurement lands.
 *
 * Children lay themselves out as flex rows: `shrink-0` for the parts that stay
 * put, `min-h-0 flex-1` with its own `overflow-y-auto` for the part that
 * scrolls.
 */
export function ListPage({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      // Whatever the layout reserves below us (the mobile bottom nav) is
      // padding on our parent, and it has to come out of the height or the
      // document gains exactly that much scroll.
      const parent = el.parentElement
      const reserved = parent ? parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0
      const height = `${Math.max(240, window.innerHeight - top - reserved)}px`
      // Our own height feeds back into the body height the observer watches,
      // so only write when it actually changed.
      if (el.style.height !== height) el.style.height = height
    }

    fit()
    window.addEventListener('resize', fit)
    // Catches the chrome above changing height while the page is open: a
    // banner appearing, a warning being dismissed.
    const observer = new ResizeObserver(fit)
    observer.observe(document.body)
    return () => {
      window.removeEventListener('resize', fit)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-0 flex-col gap-4 p-4 pt-0',
        'h-[calc(100svh-7.5rem)] md:h-[calc(100svh-4rem)]',
        className
      )}
    >
      {children}
    </div>
  )
}
