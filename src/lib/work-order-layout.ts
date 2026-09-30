/**
 * Which work order page this browser renders: the overhauled one, or the
 * classic one for whoever has asked to go back to it.
 *
 * A cookie for the same reason the list sort is one: the page is rendered on
 * the server, and reading the choice there means the first paint is already
 * the right layout rather than the other one flashing past.
 */
export type WorkOrderLayout = 'classic' | 'modern'

export const WORK_ORDER_LAYOUT_COOKIE = 'workOrderLayout'

/** A year, the same as the other remembered preferences. */
export const WORK_ORDER_LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Anything but an explicit choice of the classic page is the overhauled one. */
export function parseWorkOrderLayout(raw: string | undefined | null): WorkOrderLayout {
  return raw === 'classic' ? 'classic' : 'modern'
}

/** Client only: remember the choice for the next server render. */
export function rememberWorkOrderLayout(layout: WorkOrderLayout) {
  document.cookie = `${WORK_ORDER_LAYOUT_COOKIE}=${layout}; path=/; max-age=${WORK_ORDER_LAYOUT_COOKIE_MAX_AGE}; SameSite=Lax`
}
