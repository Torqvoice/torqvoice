/**
 * Whether this person wants to see the support button.
 *
 * Deliberately per user per device rather than a stored setting. AppSetting is
 * unique on organizationId + key, so persisting a dismissal there would let one
 * mechanic hide the button for the whole workshop. This is a personal UI
 * preference, and losing it on a new device is a smaller cost than that.
 */

export const SUPPORT_HIDDEN_STORAGE_KEY = "torqvoice.support.hidden";

/**
 * `storage` only fires in *other* tabs, so the tab that changed the value needs
 * its own signal to keep the button and the settings toggle in step.
 */
export const SUPPORT_VISIBILITY_EVENT = "torqvoice:support:visibility";

/** Asks the mounted widget to open, for the "contact support" button in settings. */
export const SUPPORT_OPEN_EVENT = "torqvoice:support:open";

export function isSupportBubbleHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SUPPORT_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    // Private browsing and locked-down profiles can throw on access. Showing
    // the button is the safer default: support stays reachable.
    return false;
  }
}

/** Where this person dragged the button to, as the trigger's top-left corner. */
export const SUPPORT_POSITION_STORAGE_KEY = "torqvoice.support.position";

export interface SupportPosition {
  x: number;
  y: number;
}

export function readSupportPosition(): SupportPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUPPORT_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    // Corrupt or unreadable storage falls back to the default corner rather
    // than leaving the button unrenderable.
    return null;
  }
}

export function writeSupportPosition(position: SupportPosition | null): void {
  if (typeof window === "undefined") return;
  try {
    if (position) {
      window.localStorage.setItem(SUPPORT_POSITION_STORAGE_KEY, JSON.stringify(position));
    } else {
      window.localStorage.removeItem(SUPPORT_POSITION_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(SUPPORT_VISIBILITY_EVENT));
  } catch {
    // The position simply will not persist.
  }
}

export function setSupportBubbleHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) {
      window.localStorage.setItem(SUPPORT_HIDDEN_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(SUPPORT_HIDDEN_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(SUPPORT_VISIBILITY_EVENT));
  } catch {
    // Nothing to do — the preference simply will not persist.
  }
}
