/**
 * Which work order page this browser renders: the one people know, or the
 * overhauled one they have to ask for.
 *
 * A cookie for the same reason the list sort is one: the page is rendered on
 * the server, and reading the choice there means the first paint is already
 * the right layout rather than the classic one flashing past.
 */
export type WorkOrderLayout = 'classic' | 'modern'

export const WORK_ORDER_LAYOUT_COOKIE = 'workOrderLayout'

/** A year, the same as the other remembered preferences. */
export const WORK_ORDER_LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Anything but an explicit opt-in is the classic page. */
export function parseWorkOrderLayout(raw: string | undefined | null): WorkOrderLayout {
  return raw === 'modern' ? 'modern' : 'classic'
}

/** Client only: remember the choice for the next server render. */
export function rememberWorkOrderLayout(layout: WorkOrderLayout) {
  document.cookie = `${WORK_ORDER_LAYOUT_COOKIE}=${layout}; path=/; max-age=${WORK_ORDER_LAYOUT_COOKIE_MAX_AGE}; SameSite=Lax`
}
