/**
 * The number an owner knows a vehicle by in their own fleet: "Unit 14",
 * "T-208". Free text the customer chose, so only its length is checked.
 */
export const FLEET_NUMBER_MAX_LENGTH = 40

/** What is stored for what was typed: trimmed, and null when nothing is left. */
export function normalizeFleetNumber(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed.slice(0, FLEET_NUMBER_MAX_LENGTH) : null
}

/** "Fleet no.: T-208" for a print, or nothing for a vehicle without one. */
export function fleetNumberLine(
  vehicle: { fleetNumber?: string | null } | null | undefined,
  label: string | undefined
): string {
  const number = normalizeFleetNumber(vehicle?.fleetNumber)
  return number ? `${label || 'Fleet no.'}: ${number}` : ''
}
