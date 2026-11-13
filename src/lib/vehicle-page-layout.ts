/**
 * Which vehicle page this browser renders: the new one (the vehicle on the
 * left, its history as one feed), or the classic one with tabs.
 *
 * Workshops that already know the classic page keep it until somebody there
 * tries the new one; workshops made after the new page shipped start on it.
 * Either way the choice is the person's: the classic page invites them to
 * try the new one, and the new page has the way back.
 *
 * A cookie, as the work order layout was while it had two: the page is
 * rendered on the server, and reading the choice there means the first paint
 * is already the right page rather than the other one flashing past.
 */
export type VehiclePageLayout = 'classic' | 'modern'

export const VEHICLE_PAGE_LAYOUT_COOKIE = 'vehiclePageLayout'

/** A year, the same as the other remembered preferences. */
export const VEHICLE_PAGE_LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Workshops created from this moment start on the new page. Older ones never
 * saw it, so they stay on what they know unless they choose otherwise.
 */
export const NEW_VEHICLE_PAGE_FROM = new Date('2026-11-14T00:00:00Z')

/** The page a browser gets: its own choice, else what its workshop's age says. */
export function parseVehiclePageLayout(
  raw: string | undefined | null,
  workshopCreatedAt: Date | null
): VehiclePageLayout {
  if (raw === 'classic' || raw === 'modern') return raw
  return workshopCreatedAt && workshopCreatedAt >= NEW_VEHICLE_PAGE_FROM ? 'modern' : 'classic'
}

/** Client only: remember the choice for the next server render. */
export function rememberVehiclePageLayout(layout: VehiclePageLayout) {
  document.cookie = `${VEHICLE_PAGE_LAYOUT_COOKIE}=${layout}; path=/; max-age=${VEHICLE_PAGE_LAYOUT_COOKIE_MAX_AGE}; SameSite=Lax`
}
