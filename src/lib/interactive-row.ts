import type { KeyboardEvent } from 'react'

/**
 * Spread onto a clickable row — a `<TableRow>` or a list-row `<div>` — to make
 * it keyboard-operable: Tab reaches it, Enter/Space activate it, and the
 * `data-row-interactive` attribute gives it a visible focus ring plus a
 * pointer cursor (styled in globals.css).
 *
 *   <TableRow {...interactiveRow(() => router.push(href))}>
 *
 * Rows keep their own semantics on purpose. They can't be `<button>`s —
 * nesting the row's dismiss/menu buttons inside one is invalid HTML — and
 * `role="button"` on a container with interactive children is an ARIA
 * violation. A focusable element that announces its content and activates on
 * Enter is the pragmatic, axe-clean middle ground.
 *
 * The `target === currentTarget` guard keeps Enter/Space pressed on inner
 * controls (checkboxes, kebab menus) from also triggering the row.
 */
export function interactiveRow(activate: () => void) {
  return {
    'data-row-interactive': true,
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        activate()
      }
    },
  }
}
