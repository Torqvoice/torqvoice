'use client'

import { useEffect, useState } from 'react'

const SIDEBAR_MIN_W = 280

interface ServiceDetailContentProps {
  leftColumn: React.ReactNode
  rightColumn: React.ReactNode
}

/**
 * The layout shell of the work order page: the job on the left, the sidebar on
 * the right, stacked on a narrow screen.
 *
 * Both columns are rendered **once**. They used to be rendered twice, one
 * layer per breakpoint with the other hidden, which put two of every field in
 * the document under the same id and name. The form then submitted the hidden
 * copy's values, native validation objected to controls the browser would not
 * focus and abandoned the submit in silence, and every row was mounted and
 * hydrated twice. One copy, and CSS decides where it sits.
 *
 * The height still comes from the box and never from the content. The single
 * layer is `position: absolute; inset: 0`, so its size is dictated by this
 * relative parent; from `lg` it becomes the grid and each column scrolls
 * inside its own track, whose height is pinned by `minmax(0, 1fr)`. That is
 * what sidesteps the `min-height: auto` flex-item rule which once let tall
 * sidebar content push the body past the viewport — an auto grid row would
 * bring it straight back.
 */
export function ServiceDetailContent({ leftColumn, rightColumn }: ServiceDetailContentProps) {
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setSidebarWidth(Math.max(SIDEBAR_MIN_W, Math.min(newWidth, window.innerWidth * 0.6)))
    }
    const onMouseUp = () => setIsDragging(false)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging])

  const rightColTrack =
    sidebarWidth != null ? `${sidebarWidth}px` : `minmax(${SIDEBAR_MIN_W}px, 22vw)`

  return (
    <div className="relative min-h-0 flex-1">
      {/* Below lg: this layer is the one scroller and the columns stack inside
          it. From lg: a three-track grid (job | handle | sidebar), each column
          scrolling in its own track. The grid properties are inert while the
          layer is a flex column. */}
      <div
        data-testid="service-layout"
        className="absolute inset-0 flex flex-col gap-3 overflow-y-auto overscroll-contain p-4 pb-40 lg:grid lg:gap-0 lg:overflow-hidden lg:p-0 lg:pb-0"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) 6px ${rightColTrack}`,
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        <div
          data-testid="service-main"
          className="space-y-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:p-4 lg:pr-2 lg:pb-40"
        >
          {leftColumn}
        </div>

        {/* Nothing to drag while the columns are stacked. */}
        <div
          data-testid="service-resize"
          className="relative hidden cursor-col-resize bg-border transition-colors hover:bg-primary/30 lg:block"
          onMouseDown={() => setIsDragging(true)}
        >
          <div className="absolute top-1/2 left-1/2 flex h-8 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border bg-background shadow-sm">
            <svg width="6" height="14" viewBox="0 0 6 14" className="text-muted-foreground">
              <path d="M1 0v14M5 0v14" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
        </div>

        <div
          data-testid="service-sidebar"
          className="space-y-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:p-4 lg:pl-2 lg:pb-40"
        >
          {rightColumn}
        </div>
      </div>
    </div>
  )
}
