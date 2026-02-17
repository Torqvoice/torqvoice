'use client'

import { useEffect, useState } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

const LG_BREAKPOINT = 1024

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
    const onChange = () => setIsLarge(mql.matches)
    mql.addEventListener('change', onChange)
    setIsLarge(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isLarge
}

interface ServiceDetailContentProps {
  leftColumn: React.ReactNode
  rightColumn: React.ReactNode
}

export function ServiceDetailContent({ leftColumn, rightColumn }: ServiceDetailContentProps) {
  const isLarge = useIsLargeScreen()

  if (!isLarge) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3 pb-40">
          {leftColumn}
          {rightColumn}
        </div>
      </div>
    )
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
      <ResizablePanel defaultSize={75} minSize={40}>
        <div className="h-full overflow-y-auto p-4 pr-2">
          <div className="space-y-3 pb-40">{leftColumn}</div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={25} minSize={15}>
        <div className="h-full overflow-y-auto p-4 pl-2">
          <div className="space-y-3 pb-40">{rightColumn}</div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
