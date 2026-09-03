/**
 * Plates as people type and store them: "SK-209-X", "sk 209 x", "SK209X" are
 * one plate. The compact form is what registries take and what two stored
 * plates are compared on.
 */
export function compactPlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()
}

/** Whether a string could be a plate at all: two to twelve letters and digits once compacted. */
export function looksLikePlate(plate: string): boolean {
  const compact = compactPlate(plate)
  return compact.length >= 2 && compact.length <= 12
}
