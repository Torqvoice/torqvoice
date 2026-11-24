/**
 * A VIN as ISO 3779 writes it since 1981: seventeen letters and digits,
 * never I, O or Q, which read as 1 and 0. Older vehicles and boats carry
 * other identifiers, so a VIN that is not one is said, never refused.
 */
export const VIN_LENGTH = 17
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

/** True for an empty box or a well-formed VIN; spaces and case are forgiven. */
export function looksLikeVin(value: string | null | undefined): boolean {
  const compact = (value ?? '').replace(/\s+/g, '').toUpperCase()
  return compact === '' || VIN_PATTERN.test(compact)
}

/**
 * A plate as it is compared with the workshop's other vehicles: "AB 12-345"
 * and "ab12345" are the same plate. Only the marks people group a plate with
 * are dropped, so a plate in any script still compares.
 */
export function plateMatchKey(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s.\-]+/g, '').toUpperCase()
}
