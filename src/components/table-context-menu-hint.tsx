'use client'

import { MousePointerClick } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Muted bar that sits above a list table and tells the user its rows carry a
 * right-click menu. Hidden below md, where there is no right-click to hint at.
 */
export function TableContextMenuHint() {
  const t = useTranslations('common.contextMenu')
  return (
    <div className="hidden shrink-0 items-center gap-1.5 border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground md:flex">
      <MousePointerClick className="h-3.5 w-3.5" />
      {t('hint')}
    </div>
  )
}
