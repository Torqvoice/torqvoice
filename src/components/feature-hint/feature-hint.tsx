'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Popover, PopoverAnchor, PopoverArrow, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
 * Anything else outside closes it too, unless the caller asks for an
 * acknowledgement.
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
  href,
  cta,
  variant = 'hint',
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
   * Where the feature lives. A hint about a toggle somebody just flipped needs
   * no link, because the anchor underneath already is the way there. An
   * announcement about something further in does: the anchored link is only
   * the neighbourhood, and leaving somebody to hunt for the rest of the route
   * is how an announcement ends up ignored.
   */
  href?: string
  /** The wording on that link. Required whenever `href` is given. */
  cta?: string
  /**
   * How much of an event this is, which decides both how loud the card looks
   * and what it takes to close it.
   *
   * A `hint` follows something the workshop just did, so it is a quiet note in
   * the usual popover colours and a click anywhere is fair evidence they are
   * done reading.
   *
   * An `announcement` is the opposite on both counts. Nobody asked for it, so
   * it is painted in the accent colour to be worth the interruption rather
   * than sitting white on a white page. And it is the one time the workshop is
   * told, dismissed for everybody at once, so it waits for a button: spending
   * that on a stray click at the far side of the screen is how a colleague
   * ends up never hearing about the feature at all. Escape still closes it,
   * being a deliberate keypress rather than a mis-aimed click.
   */
  variant?: 'hint' | 'announcement'
  /**
   * What the card points at. Stays fully interactive. Given the open state so
   * it can highlight itself while the card is up.
   */
  children: React.ReactNode | ((open: boolean) => React.ReactNode)
}) {
  const t = useTranslations('common')
  const { open, dismiss } = useFeatureHint(id, eligible)
  const loud = variant === 'announcement'

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
        // Clicking the thing it points at counts as finding it, unless this
        // one is waiting to be acknowledged. `open` is controlled, so leaving
        // the click alone simply leaves the card up.
        onPointerDownOutside={() => {
          if (!loud) dismiss()
        }}
        onEscapeKeyDown={() => dismiss()}
        aria-labelledby={`${id}-hint-title`}
        aria-describedby={`${id}-hint-body`}
        className={cn(
          'w-auto max-w-xs p-0',
          loud
            ? // The surface a selected sidebar link wears, so the card reads as
              // part of the nav it is pointing into. A solid token rather than
              // primary at half alpha, which would let the page read through
              // the card's own text.
              'border-primary/40 bg-sidebar-accent text-sidebar-accent-foreground shadow-xl'
            : 'border-primary/30 shadow-lg'
        )}
      >
        <PopoverArrow
          className={
            loud ? 'fill-sidebar-accent stroke-primary/40' : 'fill-popover stroke-primary/30'
          }
          width={12}
          height={6}
        />
        {/* Announced without moving focus, so a screen reader user hears it
            without being pulled out of what they were doing. */}
        <div
          aria-live="polite"
          className={href ? 'flex flex-col gap-2 p-3' : 'flex items-center gap-3 py-2 pr-2 pl-3'}
        >
          <div className="min-w-0">
            <p id={`${id}-hint-title`} className="text-sm font-semibold">
              {title}
            </p>
            <p id={`${id}-hint-body`} className="text-xs leading-snug text-muted-foreground">
              {body}
            </p>
          </div>
          {href && cta ? (
            // Going there settles it: somebody who followed the link has been
            // told, so the workshop is not asked to acknowledge it as well.
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                onClick={() => dismiss()}
              >
                {t('buttons.gotIt')}
              </Button>
              <Button asChild size="sm" className="h-7 px-2.5 text-xs">
                <Link href={href} onClick={() => dismiss()}>
                  {cta}
                </Link>
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="h-7 shrink-0 self-center px-2.5 text-xs"
              onClick={() => dismiss()}
            >
              {t('buttons.gotIt')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
