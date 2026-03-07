'use client'

import { useEffect, useState } from 'react'

const SIDEBAR_MIN_W = 280
const SIDEBAR_DEFAULT_PCT = 0.22 // 22% of viewport

interface ServiceDetailContentProps {
  leftColumn: React.ReactNode
  rightColumn: React.ReactNode
}

export function ServiceDetailContent({ leftColumn, rightColumn }: ServiceDetailContentProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    typeof window !== 'undefined' ? Math.max(SIDEBAR_MIN_W, window.innerWidth * SIDEBAR_DEFAULT_PCT) : 380
  )
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

  return (
    <>
      {/* Mobile: stacked layout */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 lg:hidden">
        <div className="space-y-3 pb-40">
          {leftColumn}
          {rightColumn}
        </div>
      </div>

      {/* Desktop: side-by-side with resizable sidebar */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain p-4 pr-2">
          <div className="space-y-3 pb-40">{leftColumn}</div>
        </div>
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/30 transition-colors relative group"
          onMouseDown={() => setIsDragging(true)}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-4 flex items-center justify-center rounded-sm border bg-background shadow-sm">
            <svg width="6" height="14" viewBox="0 0 6 14" className="text-muted-foreground"><path d="M1 0v14M5 0v14" stroke="currentColor" strokeWidth="1" /></svg>
          </div>
        </div>
        <div
          className="shrink-0 overflow-y-auto overscroll-contain p-4 pl-2"
          style={{ width: sidebarWidth }}
        >
          <div className="space-y-3 pb-40">{rightColumn}</div>
        </div>
      </div>
    </>
  )
}
