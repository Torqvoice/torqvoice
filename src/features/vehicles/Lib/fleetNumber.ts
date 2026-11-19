/**
 * The number an owner knows a vehicle by in their own fleet: "Unit 14",
 * "T-208". Free text the customer chose, so only its length is checked.
 */
export const FLEET_NUMBER_MAX_LENGTH = 40

/**
 * What is stored for what was typed: trimmed, and null when nothing is left.
 * Never cut: a value over the limit is refused where it comes in (the form
 * and the action) or reported on its row (the importer), see
 * `fleetNumberTooLong`.
 */
export function normalizeFleetNumber(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed || null
}

/** Whether a value, once trimmed, is longer than a fleet number may be. */
export function fleetNumberTooLong(value: string | null | undefined): boolean {
  return (value ?? '').trim().length > FLEET_NUMBER_MAX_LENGTH
}

/** "Fleet no.: T-208" for a print, or nothing for a vehicle without one. */
export function fleetNumberLine(
  vehicle: { fleetNumber?: string | null } | null | undefined,
  label: string | undefined
): string {
  const number = normalizeFleetNumber(vehicle?.fleetNumber)
  return number ? `${label || 'Fleet no.'}: ${number}` : ''
}
