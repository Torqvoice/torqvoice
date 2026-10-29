'use client'

import { Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

export type SettingsPage = 'localization' | 'workshop' | 'tax'

/** "Settings → Tax", named exactly as the settings menu names it. */
export function useSettingsPath(): (page: SettingsPage) => string {
  const t = useTranslations('settings')
  return (page) => `${t('title')} → ${t(`nav.items.${page}.title`)}`
}

/** Bold for the settings path inside a `t.rich` message. */
export const settingsPathTag = (chunks: ReactNode) => (
  <strong className="font-semibold text-foreground">{chunks}</strong>
)

/** Tells the owner where a step's choices live once the workshop is open. */
export function LaterInSettings({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
      <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
