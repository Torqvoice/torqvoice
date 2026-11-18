'use client'

import { Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { type Combo, comboParts, comboSteps } from '../Lib/keys'
import { useShortcutKey, useShortcuts } from './ShortcutsProvider'

/** One key cap, the same chip the search palette draws. */
export function KeyCap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </kbd>
  )
}

/**
 * A combo as key caps, drawn the same way wherever a key is shown: the menus,
 * the palette, the help overlay and the settings page. A sequence reads
 * "G then W".
 */
export function ComboCaps({
  combo,
  className,
  capClassName,
}: {
  combo: Combo
  className?: string
  capClassName?: string
}) {
  const { platform } = useShortcuts()
  const t = useTranslations('settings.shortcuts')
  return (
    <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap', className)}>
      {comboSteps(combo).map((step, index) => (
        // By position: Alt+G, then Alt+G again, is a real sequence (the dashboard).
        <Fragment key={`${index}:${step}`}>
          {index > 0 && (
            <span className="px-0.5 font-sans text-[11px] text-muted-foreground">{t('then')}</span>
          )}
          {comboParts(step, platform).map((part) => (
            <KeyCap key={part} className={capClassName}>
              {part}
            </KeyCap>
          ))}
        </Fragment>
      ))}
    </span>
  )
}

/**
 * The key for a shortcut, beside the thing it does: a menu item, a tooltip,
 * a palette row. Draws nothing when the shortcut is off, has no key or is not
 * this person's to use, and nothing on a phone, where there is no keyboard.
 */
export function ShortcutKeys({ id, className }: { id: string; className?: string }) {
  const key = useShortcutKey(id)
  if (!key) return null
  return <ComboCaps combo={key.combo} className={cn('max-md:hidden', className)} />
}
