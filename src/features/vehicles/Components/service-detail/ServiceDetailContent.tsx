'use client'

import { useEffect, useState } from 'react'

const SIDEBAR_MIN_W = 280

interface ServiceDetailContentProps {
  leftColumn: React.ReactNode
  rightColumn: React.ReactNode
}

// Bulletproof layout shell. The outer is a relative box that fills its flex parent.
// Each scroll region is `position: absolute; inset: 0` inside its own relative cell,
// so its size is dictated entirely by the cell's geometry (grid track width / parent
// height) and never by its content's intrinsic min-size. This sidesteps the
// `min-height: auto` flex-item rule that was letting tall right-column content push
// the body taller than the viewport.
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
      {/* Mobile: stacked, page scrolls inside the absolute layer */}
      <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4 lg:hidden">
        <div className="space-y-3 pb-40">
          {leftColumn}
          {rightColumn}
        </div>
      </div>

      {/* Desktop: 3-track grid (left | resize handle | right sidebar) */}
      <div
        className="absolute inset-0 hidden lg:grid"
        style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${rightColTrack}` }}
      >
        <div className="relative">
          <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4 pr-2">
            <div className="space-y-3 pb-40">{leftColumn}</div>
          </div>
        </div>

        <div
          className="relative cursor-col-resize bg-border transition-colors hover:bg-primary/30"
          onMouseDown={() => setIsDragging(true)}
        >
          <div className="absolute top-1/2 left-1/2 flex h-8 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border bg-background shadow-sm">
            <svg width="6" height="14" viewBox="0 0 6 14" className="text-muted-foreground">
              <path d="M1 0v14M5 0v14" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4 pl-2">
            <div className="space-y-3 pb-40">{rightColumn}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
