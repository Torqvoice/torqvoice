/**
 * How a key press is named, matched and shown.
 *
 * A combo is a canonical string: `mod+`, `alt+`, `shift+` in that order, then
 * the key (`mod+k`, `alt+shift+w`, `d`, `arrowright`). The two modifiers are
 * abstract, because the same habit sits on different keys per platform:
 *
 *   mod  Ctrl on Windows and Linux, Command on a Mac
 *   alt  Alt on Windows and Linux, Control on a Mac (Option types characters
 *        there, so it cannot carry a shortcut)
 *
 * The key is the character the layout produces, not the physical key, so an
 * AZERTY keyboard presses the key that is printed W and a Norwegian one finds
 * `/` wherever it lives. Layouts that produce no Latin letter (Russian) fall
 * back to the physical key.
 *
 * Two combos with a space between them are a sequence, pressed one after the
 * other: `alt+g alt+w` is Alt+G, then Alt+W. Only the registry's go-to set
 * uses them; a person cannot record one.
 */
export type Combo = string
export type Platform = 'mac' | 'other'

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
> & { getModifierState?: (key: string) => boolean }

const IGNORED_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Dead',
  'Process',
  'Unidentified',
  'OS',
  'Fn',
  'ContextMenu',
])

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const hint =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ''
  return /mac|iphone|ipad/i.test(hint) ? 'mac' : 'other'
}

let cachedPlatform: Platform | null = null

/** The platform, looked up once. Only for code that runs on a key press. */
export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  cachedPlatform ??= detectPlatform()
  return cachedPlatform
}

function keyName(
  e: KeyEventLike
): { name: string; isCharacter: boolean; isLetter: boolean } | null {
  const { key } = e
  if (!key || IGNORED_KEYS.has(key)) return null
  if (key === ' ') return { name: 'space', isCharacter: false, isLetter: false }
  if (key.length > 1) return { name: key.toLowerCase(), isCharacter: false, isLetter: false }
  if (/^[a-z]$/i.test(key)) return { name: key.toLowerCase(), isCharacter: true, isLetter: true }
  // A layout with no Latin letters on this key: go by where the key sits.
  const physical = /^Key([A-Z])$/.exec(e.code ?? '')
  if (physical && key.charCodeAt(0) > 127) {
    return { name: physical[1].toLowerCase(), isCharacter: true, isLetter: true }
  }
  return { name: key.toLowerCase(), isCharacter: true, isLetter: false }
}

function build(mod: boolean, alt: boolean, shift: boolean, name: string): Combo {
  return `${mod ? 'mod+' : ''}${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${name}`
}

/**
 * The combos a key press may stand for, most specific first, or none when the
 * press cannot be a shortcut (a lone modifier, AltGr, Option on a Mac).
 *
 * On a Mac, Control is `alt`; but Ctrl+K and Ctrl+S worked there before the
 * registry existed, so the same press is offered a second time as `mod`.
 */
export function combosFromEvent(e: KeyEventLike, platform: Platform): Combo[] {
  const key = keyName(e)
  if (!key) return []
  // AltGr types characters (@ and € on European layouts) and reports as
  // Ctrl+Alt on Windows.
  if (e.getModifierState?.('AltGraph')) return []
  // Punctuation already says whether Shift was held: `/` is Shift+7 on a
  // Norwegian keyboard and a key of its own on a US one.
  const shift = e.shiftKey && (key.isLetter || !key.isCharacter)

  if (platform === 'mac') {
    if (e.altKey) return []
    if (e.metaKey && e.ctrlKey) return []
    if (e.metaKey) return [build(true, false, shift, key.name)]
    if (e.ctrlKey) {
      return [build(false, true, shift, key.name), build(true, false, shift, key.name)]
    }
    return [build(false, false, shift, key.name)]
  }
  if (e.metaKey) return []
  if (e.ctrlKey && e.altKey) return []
  return [build(e.ctrlKey, e.altKey, shift, key.name)]
}

/** The one combo a press records as, for the settings page. */
export function comboFromEvent(e: KeyEventLike, platform: Platform): Combo | null {
  return combosFromEvent(e, platform)[0] ?? null
}

export type ParsedCombo = { mod: boolean; alt: boolean; shift: boolean; key: string }

export function parseCombo(combo: Combo): ParsedCombo | null {
  const match = /^(mod\+)?(alt\+)?(shift\+)?(.+)$/.exec(combo)
  if (!match) return null
  const key = match[4]
  if (key !== key.toLowerCase() || /\s/.test(key) || key.length > 12) return null
  if (key.length > 1 && !/^[a-z0-9]+$/.test(key)) return null
  return { mod: !!match[1], alt: !!match[2], shift: !!match[3], key }
}

/** The presses of a combo, in order: one for a chord, two for a sequence. */
export function comboSteps(combo: Combo): Combo[] {
  return combo.split(' ')
}

export function isSequence(combo: Combo): boolean {
  return combo.includes(' ')
}

/** Ctrl, Command or Alt is part of it, so it can never be typed into a field. */
export function hasModifier(combo: Combo): boolean {
  return comboSteps(combo).every((step) => {
    const parsed = parseCombo(step)
    return !!parsed && (parsed.mod || parsed.alt)
  })
}

const LONE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'])

/** Alt, Ctrl, Shift or Command going down on its own, on the way to a chord. */
export function isLoneModifier(event: Pick<KeyboardEvent, 'key'>): boolean {
  return LONE_MODIFIERS.has(event.key)
}

/**
 * Made of bare printable characters only: what WCAG 2.1.4 calls a character
 * key shortcut, and so one a person must be able to switch off.
 */
export function isCharacterKey(combo: Combo): boolean {
  return comboSteps(combo).every((step) => {
    const parsed = parseCombo(step)
    return !!parsed && !parsed.mod && !parsed.alt && parsed.key.length === 1
  })
}

/**
 * Keys the browser or the system keeps for itself, or that already mean
 * something on every page. A page cannot take most of these over, and the
 * rest would break copying, printing or moving through a form.
 */
const RESERVED = new Set<Combo>([
  // Tabs and windows: the browser acts before the page hears of it.
  'mod+w',
  'mod+shift+w',
  'mod+t',
  'mod+shift+t',
  'mod+n',
  'mod+shift+n',
  'mod+q',
  'mod+shift+q',
  'mod+tab',
  'mod+shift+tab',
  'mod+r',
  'mod+shift+r',
  'mod+l',
  'mod+h',
  'mod+j',
  'mod+d',
  'mod+o',
  'mod+u',
  'mod+shift+i',
  'mod+shift+j',
  'mod+shift+c',
  'mod+shift+delete',
  // Editing: these belong to whatever field has the cursor.
  'mod+c',
  'mod+v',
  'mod+x',
  'mod+a',
  'mod+z',
  'mod+shift+z',
  'mod+y',
  'mod+f',
  'mod+g',
  'mod+p',
  'mod+0',
  'mod+-',
  'mod++',
  'mod+=',
  // Alt on Windows. Chrome and Edge open their menu on Alt+F and Alt+E and
  // the address bar on Alt+D. Firefox opens a menu on the letters of its
  // menu bar (File, Edit, View, History, Bookmarks, Tools, Help) even when
  // the page has handled the key. Windows 11 uses Alt+A for suggested actions.
  'alt+f',
  'alt+e',
  'alt+d',
  'alt+v',
  'alt+s',
  'alt+b',
  'alt+t',
  'alt+h',
  'alt+a',
  'alt+enter',
  'alt+escape',
  'alt+arrowup',
  'alt+arrowdown',
  'alt+pageup',
  'alt+pagedown',
  'alt+printscreen',
  'alt+f4',
  'alt+arrowleft',
  'alt+arrowright',
  'alt+home',
  'alt+tab',
  'alt+space',
])

const RESERVED_KEYS = new Set([
  'tab',
  'enter',
  'escape',
  'space',
  'backspace',
  'delete',
  'f5',
  'f11',
  'f12',
])

export function isReservedCombo(combo: Combo): boolean {
  const parsed = parseCombo(combo)
  if (!parsed) return true
  if (RESERVED.has(combo)) return true
  // Alt+Shift is how Windows switches the keyboard language, so a chord
  // built on it can change the layout under the person's hands.
  if (parsed.alt && parsed.shift) return true
  if (/^[1-9]$/.test(parsed.key) && parsed.mod && !parsed.alt) return true
  return RESERVED_KEYS.has(parsed.key)
}

const KEY_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'Esc',
  enter: 'Enter',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Del',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
}

/** The key caps to draw for one press, one string per cap. */
export function comboParts(combo: Combo, platform: Platform): string[] {
  const parsed = parseCombo(combo)
  if (!parsed) return []
  const mac = platform === 'mac'
  const parts: string[] = []
  if (parsed.alt && mac) parts.push('⌃')
  if (parsed.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (parsed.alt && !mac) parts.push('Alt')
  if (parsed.shift) parts.push(mac ? '⇧' : 'Shift')
  const label = KEY_LABELS[parsed.key]
  if (label) parts.push(label)
  else if (parsed.key.length === 1) parts.push(parsed.key.toUpperCase())
  else parts.push(parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1))
  return parts
}

/**
 * The combo as one string, for a title attribute or a screen reader. `then`
 * is the word between the presses of a sequence, in the reader's language.
 */
export function comboText(combo: Combo, platform: Platform, then = '→'): string {
  return comboSteps(combo)
    .map((step) => comboParts(step, platform).join(platform === 'mac' ? ' ' : '+'))
    .join(` ${then} `)
}

/**
 * Where a bare key (a letter, an arrow, a "G then W") already means
 * something, so no shortcut may take it:
 *
 *  - anything typed into: every input, textarea and select, the rich text
 *    editors (contenteditable), and the ARIA text roles;
 *  - widgets that use letters or arrows themselves: comboboxes, lists and
 *    their options, menus, trees, grids, tabs, radios, sliders, and the
 *    search palette (cmdk);
 *  - embedded documents, which have a keyboard of their own;
 *  - anything a screen marks with `data-shortcuts="off"`.
 *
 * A button, a link or a table row uses no letters, so a shortcut still works
 * with the focus resting on one, as it does on the page itself.
 */
const CLAIMS_PLAIN_KEYS = [
  'input',
  'textarea',
  'select',
  'option',
  '[contenteditable]:not([contenteditable="false"])',
  'iframe',
  'embed',
  'object',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[role="grid"]',
  '[role="gridcell"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="application"]',
  '[cmdk-root]',
  '[data-shortcuts="off"]',
].join(', ')

/** An element and everything above it, out through any shadow roots. */
function withAncestors(start: Element | null): Element[] {
  const chain: Element[] = []
  let node: Element | null = start
  while (node) {
    chain.push(node)
    const root = node.parentElement ? null : node.getRootNode()
    node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return chain
}

/** The element that really has the focus, inside a shadow root if need be. */
function deepActiveElement(): Element | null {
  if (typeof document === 'undefined') return null
  let active: Element | null = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

/**
 * A bare key pressed here belongs to what has the focus, not to a shortcut.
 * Asked of both the path the event took (which sees into shadow roots) and
 * the focused element, so neither a retargeted event nor a key that arrives
 * while focus is moving can slip past.
 */
export function claimsPlainKeys(event: Pick<KeyboardEvent, 'target' | 'composedPath'>): boolean {
  if (typeof document !== 'undefined' && document.designMode === 'on') return true
  const path =
    typeof event.composedPath === 'function'
      ? event.composedPath().filter((node): node is Element => node instanceof Element)
      : []
  const fromTarget = event.target instanceof Element ? withAncestors(event.target) : []
  const candidates = [...path, ...fromTarget, ...withAncestors(deepActiveElement())]
  return candidates.some((element) => element.matches(CLAIMS_PLAIN_KEYS))
}

const OPEN_LAYER = [
  // Radix and vaul: dialogs, alert dialogs, sheets, drawers and popovers all
  // render a dialog role; it stays in the page a moment after closing.
  '[role="dialog"]:not([data-state="closed"])',
  '[role="alertdialog"]:not([data-state="closed"])',
  '[aria-modal="true"]',
  '[data-vaul-drawer]:not([data-state="closed"])',
  // Dropdown and context menus.
  '[role="menu"]:not([data-state="closed"])',
  // Anything Radix floats: selects, comboboxes, date pickers, popovers.
  '[data-radix-popper-content-wrapper]',
  // The app's own lightboxes and overlays.
  '[data-shortcut-layer]',
].join(', ')

/**
 * A dialog, sheet, drawer, popover, menu, dropdown or lightbox is up and
 * owns the keyboard. A tooltip is not one: it opens under the mouse and
 * takes no keys.
 */
export function isLayerOpen(root: ParentNode = document): boolean {
  for (const layer of root.querySelectorAll(OPEN_LAYER)) {
    if (
      layer.matches('[data-radix-popper-content-wrapper]') &&
      layer.querySelector('[role="tooltip"]')
    ) {
      continue
    }
    return true
  }
  return false
}
