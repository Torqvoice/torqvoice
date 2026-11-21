/**
 * Whether this person wants to see the support button.
 *
 * Deliberately per user per device rather than a stored setting. AppSetting is
 * unique on organizationId + key, so persisting a dismissal there would let one
 * mechanic hide the button for the whole workshop. This is a personal UI
 * preference, and losing it on a new device is a smaller cost than that.
 */

export const SUPPORT_HIDDEN_STORAGE_KEY = 'torqvoice.support.hidden'

/**
 * `storage` only fires in *other* tabs, so the tab that changed the value needs
 * its own signal to keep the button and the settings toggle in step.
 */
export const SUPPORT_VISIBILITY_EVENT = 'torqvoice:support:visibility'

/** Asks the mounted widget to open, for the "contact support" button in settings. */
export const SUPPORT_OPEN_EVENT = 'torqvoice:support:open'

/** What a caller can hand the widget when opening it. */
export interface SupportOpenDetail {
  /** Prefills the subject of an empty form; never overwrites what someone typed. */
  subject?: string
  /** Prefills the message of an empty form the same way, such as the fault code being read. */
  message?: string
}

/**
 * Opens the widget from anywhere in the app.
 *
 * Un-hides it first, because a dispatch into an unmounted widget is simply
 * lost, and waits a frame so the widget has mounted before it is asked to
 * open. Callers that hand over a subject, like the integration suggestion
 * button, get a form that already says what it is about.
 */
export function openSupport(detail: SupportOpenDetail = {}): void {
  if (typeof window === 'undefined') return
  if (isSupportBubbleHidden()) setSupportBubbleHidden(false)
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent<SupportOpenDetail>(SUPPORT_OPEN_EVENT, { detail }))
  })
}

export function isSupportBubbleHidden(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SUPPORT_HIDDEN_STORAGE_KEY) === 'true'
  } catch {
    // Private browsing and locked-down profiles can throw on access. Showing
    // the button is the safer default: support stays reachable.
    return false
  }
}

/**
 * Where the button sat before its place was kept relative to a corner: the
 * trigger's top-left corner in pixels. Still read, so a place chosen before
 * that change is not lost, and never written.
 */
export const SUPPORT_POSITION_STORAGE_KEY = 'torqvoice.support.position'

/** The trigger's top-left corner, in pixels from the top-left of the window. */
export interface SupportPosition {
  x: number
  y: number
}

/** Where this person dragged the button to. */
export const SUPPORT_ANCHOR_STORAGE_KEY = 'torqvoice.support.anchor'

/**
 * The button's place as a distance to the two window edges it was left
 * nearest to. Pixels from the top-left only mean something in the window they
 * were measured in: a place near the bottom right of a large window is off
 * screen in a small one, and what a small window allows is the middle of a
 * large one.
 */
export interface SupportAnchor {
  horizontal: 'left' | 'right'
  /** Distance from that side of the window to the same side of the button. */
  x: number
  vertical: 'top' | 'bottom'
  /** Distance from that edge of the window to the same edge of the button. */
  y: number
}

function readStored(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    // Corrupt or unreadable storage falls back to the default corner rather
    // than leaving the button unrenderable.
    return null
  }
}

function isDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function readSupportAnchor(): SupportAnchor | null {
  const parsed = readStored(SUPPORT_ANCHOR_STORAGE_KEY) as Partial<SupportAnchor> | null
  if (!parsed || typeof parsed !== 'object') return null
  if (parsed.horizontal !== 'left' && parsed.horizontal !== 'right') return null
  if (parsed.vertical !== 'top' && parsed.vertical !== 'bottom') return null
  if (!isDistance(parsed.x) || !isDistance(parsed.y)) return null
  return { horizontal: parsed.horizontal, x: parsed.x, vertical: parsed.vertical, y: parsed.y }
}

/** A place saved by a build that kept pixels from the top-left. */
export function readLegacySupportPosition(): SupportPosition | null {
  const parsed = readStored(SUPPORT_POSITION_STORAGE_KEY) as Partial<SupportPosition> | null
  if (!parsed || typeof parsed !== 'object') return null
  if (!isDistance(parsed.x) || !isDistance(parsed.y)) return null
  return { x: parsed.x, y: parsed.y }
}

export function writeSupportAnchor(anchor: SupportAnchor): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SUPPORT_ANCHOR_STORAGE_KEY, JSON.stringify(anchor))
    // Superseded, and would otherwise come back if the new key were cleared.
    window.localStorage.removeItem(SUPPORT_POSITION_STORAGE_KEY)
    window.dispatchEvent(new Event(SUPPORT_VISIBILITY_EVENT))
  } catch {
    // The position simply will not persist.
  }
}

export function setSupportBubbleHidden(hidden: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (hidden) {
      window.localStorage.setItem(SUPPORT_HIDDEN_STORAGE_KEY, 'true')
    } else {
      window.localStorage.removeItem(SUPPORT_HIDDEN_STORAGE_KEY)
    }
    window.dispatchEvent(new Event(SUPPORT_VISIBILITY_EVENT))
  } catch {
    // Nothing to do — the preference simply will not persist.
  }
}
