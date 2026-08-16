'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'
import { THEMES, type ThemePreference } from '@/lib/themes'

function ThemeSwatch({ colors }: { colors: [string, string, string] }) {
  const [background, surface, primary] = colors
  return (
    <span
      className="flex h-12 w-full items-center overflow-hidden rounded-md border"
      style={{ background }}
    >
      <span className="h-full w-1/4 shrink-0" style={{ background: surface }} />
      <span className="flex flex-1 items-center justify-center">
        <span className="h-2.5 w-8 rounded-full" style={{ background: primary }} />
      </span>
    </span>
  )
}

/**
 * Grid of theme presets. Selecting one applies it immediately and stores it in
 * the browser, so there is nothing to save on the server.
 */
export function ThemePicker() {
  const t = useTranslations('settings')
  const { theme, setTheme } = useTheme()

  // The stored preference is only known on the client, so wait for mount
  // before marking a card as selected (avoids a hydration mismatch).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const options: Array<{
    id: ThemePreference
    label: string
    swatch?: [string, string, string]
  }> = [
    ...THEMES.map((definition) => ({
      id: definition.id as ThemePreference,
      label: t(`appearance.themes.${definition.id}`),
      swatch: definition.swatch,
    })),
    { id: 'system', label: t('appearance.themes.system') },
  ]

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      role="radiogroup"
      aria-label={t('appearance.themeLabel')}
    >
      {options.map((option) => {
        const selected = mounted && theme === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.id)}
            className={cn(
              'group relative rounded-lg border p-2 text-left transition-colors',
              'hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'border-primary ring-2 ring-primary/40' : 'border-border'
            )}
          >
            {option.swatch ? (
              <ThemeSwatch colors={option.swatch} />
            ) : (
              <span className="flex h-12 w-full items-center justify-center rounded-md border bg-muted">
                <Monitor className="h-5 w-5 text-muted-foreground" />
              </span>
            )}
            <span className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{option.label}</span>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
