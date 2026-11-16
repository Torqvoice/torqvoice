'use client'

import { useEffect } from 'react'
import { useShortcutMatcher } from '@/features/shortcuts/Components/ShortcutsProvider'

const SAVE_BUTTON = '[data-save-shortcut]'
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

function usable(button: HTMLElement) {
  return !(button as HTMLButtonElement).disabled && button.getClientRects().length > 0
}

/**
 * The save button the shortcut stands for: the one closest to where the
 * person is typing, so a page with a Save per card saves the card in use,
 * and the first one on the page when nothing has focus.
 */
function findSaveButton(scope: Element, insideDialog: boolean): HTMLElement | null {
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(SAVE_BUTTON)).filter(
    (button) => usable(button) && (insideDialog || !button.closest(OPEN_DIALOG))
  )
  if (candidates.length === 0) return null
  let node: Element | null = document.activeElement
  while (node && node !== scope && scope.contains(node)) {
    const near = candidates.find((button) => node?.contains(button))
    if (near) return near
    node = node.parentElement
  }
  return candidates[0]
}

/**
 * Pressed with the mouse, a button first takes focus off the field, and
 * fields that commit on blur rely on that. The shortcut does the same, then
 * hands the focus back so typing carries on.
 */
function press(button: HTMLElement) {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  focused?.blur()
  setTimeout(() => {
    button.click()
    if (focused?.isConnected) focused.focus()
  }, 0)
}

/**
 * The save shortcut (Ctrl+S / Cmd+S unless changed) for everything that saves through a button marked
 * `data-save-shortcut`: settings pages and dialogs. The document editors
 * register their own save with `useSaveShortcut`; an open dialog with a save
 * button goes first, then the editor, then a save button on the page.
 */
export function SaveShortcutListener() {
  // The key is the person's own, from the shortcut registry. The listeners
  // stay here because the order they run in is what picks the right save.
  const isSaveShortcut = useShortcutMatcher('general.save')
  useEffect(() => {
    const topDialog = () => Array.from(document.querySelectorAll(OPEN_DIALOG)).at(-1) ?? null

    const dialogFirst = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e)) return
      const dialog = topDialog()
      const button = dialog && findSaveButton(dialog, true)
      if (!button) return
      e.preventDefault()
      e.stopPropagation()
      press(button)
    }

    const pageLast = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e) || e.defaultPrevented) return
      // A save button on the page is not what someone looking at a dialog
      // means to press.
      if (document.querySelector('[data-slot$="-content"][role$="dialog"][data-state="open"]'))
        return
      const button = findSaveButton(document.body, false)
      if (!button) return
      e.preventDefault()
      press(button)
    }

    window.addEventListener('keydown', dialogFirst, true)
    window.addEventListener('keydown', pageLast)
    return () => {
      window.removeEventListener('keydown', dialogFirst, true)
      window.removeEventListener('keydown', pageLast)
    }
  }, [isSaveShortcut])

  return null
}
