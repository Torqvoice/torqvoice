'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_FONT_SET,
  FONT_SET_STORAGE_KEY,
  FONT_SETS,
  type FontSetId,
  applyFontSet,
  isFontSetId,
} from '@/lib/font-sets'

/** What each set is drawn in, so a card shows its own fonts whatever is active. */
const PREVIEW: Record<FontSetId, { display: string; text: string; mono: string; caps: boolean }> = {
  default: {
    display: 'var(--font-geist-sans-base)',
    text: 'var(--font-geist-sans-base)',
    mono: 'var(--font-geist-mono-base)',
    caps: false,
  },
  workshop: {
    display: 'var(--font-barlow-condensed)',
    text: 'var(--font-plex-sans)',
    mono: 'var(--font-plex-mono)',
    caps: true,
  },
  precise: {
    display: 'var(--font-inter-tight)',
    text: 'var(--font-inter)',
    mono: 'var(--font-jetbrains-mono)',
    caps: false,
  },
  legible: {
    display: 'var(--font-atkinson)',
    text: 'var(--font-atkinson)',
    mono: 'var(--font-atkinson-mono)',
    caps: false,
  },
}

/**
 * The font sets as cards, each set in its own type. Choosing one applies it at
 * once and keeps it in this browser, like the theme beside it: nothing is
 * saved on the server.
 */
export function FontSetPicker() {
  const t = useTranslations('settings.appearance')
  // Only known on the client, so nothing is marked until mount.
  const [active, setActive] = useState<FontSetId | null>(null)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(FONT_SET_STORAGE_KEY)
    } catch {
      // Private mode: the default it is.
    }
    setActive(isFontSetId(stored) ? stored : DEFAULT_FONT_SET)
  }, [])

  const choose = (id: FontSetId) => {
    setActive(id)
    applyFontSet(document.documentElement, id)
    try {
      localStorage.setItem(FONT_SET_STORAGE_KEY, id)
    } catch {
      // Private mode: it still applies until the tab is closed.
    }
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      role="radiogroup"
      aria-label={t('fontLabel')}
    >
      {FONT_SETS.map((id) => {
        const preview = PREVIEW[id]
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`font-set-${id}`}
            onClick={() => choose(id)}
            className={cn(
              'relative cursor-pointer rounded-lg border p-3 text-left transition-colors',
              selected ? 'border-primary bg-primary/5' : 'hover:border-primary/40 hover:bg-muted/40'
            )}
          >
            {selected && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
            <span
              className="block text-xl font-semibold leading-tight"
              style={{
                fontFamily: preview.display,
                textTransform: preview.caps ? 'uppercase' : undefined,
                letterSpacing: preview.caps ? '0.03em' : undefined,
              }}
            >
              {t('fontSampleHeading')}
            </span>
            <span className="mt-1 block text-sm" style={{ fontFamily: preview.text }}>
              {t('fontSampleText')}
            </span>
            <span
              className="mt-1 block text-sm tabular-nums text-muted-foreground"
              style={{ fontFamily: preview.mono }}
            >
              2026-1067 · B8S5 O0Il1 · 1 250.00
            </span>
            <span className="mt-2 block text-xs font-medium">{t(`fonts.${id}.name`)}</span>
            <span className="block text-xs text-muted-foreground">
              {t(`fonts.${id}.description`)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
