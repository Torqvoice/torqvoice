'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Popover, PopoverAnchor, PopoverArrow, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useFeatureHint } from './feature-hint-provider'

/**
 * A one-time note pointing at something new, anchored to the thing itself.
 *
 * Deliberately one card, one sentence and one button, rather than a tour. A
 * workshop turning on a module wants to know where it landed, not to be walked
 * through it, and a multi-step tour on a screen somebody is trying to work on
 * gets clicked past without being read.
 *
 * It has to be obvious what it points at, so it carries an arrow into the
 * anchor and hands the anchor an `open` flag to mark itself with. A card
 * floating beside a list of twelve links names none of them.
 *
 * The anchor is an anchor, not a trigger: the link underneath stays clickable,
 * and clicking it counts as having found the thing, so the hint closes.
 * Anything else outside closes it too.
 *
 * Non-modal on purpose. It never traps focus and never steals it, because
 * stealing focus on page load throws a keyboard user out of whatever they were
 * doing. It is announced politely instead, and closes on Escape.
 */
export function FeatureHint({
  id,
  eligible,
  title,
  body,
  side = 'right',
  children,
}: {
  /**
   * Stable and versioned, e.g. `tire-hotel.v1`. Bumping the version is how a
   * reworded hint gets shown again to a workshop that dismissed the old one.
   */
  id: string
  /** The caller's condition, e.g. the module having just been switched on. */
  eligible: boolean
  title: string
  body: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  /**
   * What the card points at. Stays fully interactive. Given the open state so
   * it can highlight itself while the card is up.
   */
  children: React.ReactNode | ((open: boolean) => React.ReactNode)
}) {
  const t = useTranslations('common')
  const { open, dismiss } = useFeatureHint(id, eligible)

  // Escape closes it wherever focus happens to be. Focus is never moved into
  // the card, and Radix only sees the key when it is.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, dismiss])

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        {typeof children === 'function' ? children(open) : children}
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={10}
        collisionPadding={12}
        // Focus stays where the person put it.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Clicking the thing it points at counts as finding it.
        onPointerDownOutside={() => dismiss()}
        onEscapeKeyDown={() => dismiss()}
        aria-labelledby={`${id}-hint-title`}
        aria-describedby={`${id}-hint-body`}
        className="w-auto max-w-xs border-primary/30 p-0 shadow-lg"
      >
        <PopoverArrow className="fill-popover stroke-primary/30" width={12} height={6} />
        {/* Announced without moving focus, so a screen reader user hears it
            without being pulled out of what they were doing. */}
        <div aria-live="polite" className="flex items-center gap-3 py-2 pr-2 pl-3">
          <div className="min-w-0">
            <p id={`${id}-hint-title`} className="text-sm font-semibold">
              {title}
            </p>
            <p id={`${id}-hint-body`} className="text-xs leading-snug text-muted-foreground">
              {body}
            </p>
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 self-center px-2.5 text-xs"
            onClick={() => dismiss()}
          >
            {t('buttons.gotIt')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
