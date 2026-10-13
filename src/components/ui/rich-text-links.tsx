'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * How a link behaves inside a rich text editor, shared by every editor in
 * the app so a link in a work order note, a quote note and a vehicle note
 * all answer the same way.
 *
 * A plain click in text being written puts the cursor in the link, so its
 * words can be changed. Ctrl or Cmd with the click opens it in a new tab,
 * and hovering the link says so, because nothing else on the page does.
 */

/** Cmd is the key on a Mac, an iPad or an iPhone; Ctrl everywhere else. */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/**
 * The address a click in the editor should open, or null when the click is
 * an ordinary one. Only Ctrl or Cmd with the click, only on a link, only in
 * editable text, and only the kinds of address the link extension writes.
 */
export function linkToOpen(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'target'>,
  editable: boolean
): string | null {
  if (!editable || !(event.ctrlKey || event.metaKey)) return null
  const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  return /^(https?:|mailto:)/i.test(anchor.href) ? anchor.href : null
}

/** The tiptap `handleClick` that opens a link on Ctrl or Cmd click. */
export function openLinkOnModifierClick(
  view: { editable: boolean },
  _pos: number,
  event: MouseEvent
): boolean {
  const href = linkToOpen(event, view.editable)
  if (!href) return false
  window.open(href, '_blank', 'noopener,noreferrer')
  return true
}

/** How the link extension is set up in every editor. */
export const EDITOR_LINK_OPTIONS = {
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
} as const

/**
 * The "hold Ctrl and click to open" hint. Spread `handlers` on the element
 * that holds the editor's text and render `hint` anywhere inside the editor;
 * it is drawn in viewport coordinates, so the editor's clipping cannot cut it.
 * Text that is not editable opens its links on a plain click and gets no hint.
 */
export function useLinkHint(editable: boolean) {
  const t = useTranslations('common.richText')
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const hide = () => setAt(null)

  const handlers = {
    onMouseOver: (e: React.MouseEvent) => {
      if (!editable) return
      const anchor = (e.target as HTMLElement).closest?.('a[href]')
      if (!anchor) return
      const box = anchor.getBoundingClientRect()
      setAt({ left: box.left, top: box.bottom + 6 })
    },
    onMouseOut: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('a[href]')) hide()
    },
    onScroll: hide,
    onKeyDown: hide,
  }

  const hint =
    at && editable ? (
      <div
        role="tooltip"
        data-testid="link-open-hint"
        className="pointer-events-none fixed z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
        style={{ left: at.left, top: at.top }}
      >
        {t('openLinkHint', { key: isApplePlatform() ? '⌘' : 'Ctrl' })}
      </div>
    ) : null

  return { handlers, hint }
}
