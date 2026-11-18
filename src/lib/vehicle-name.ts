/**
 * A vehicle's display name, the way the rest of the app builds it: the
 * year, make and model, spaced, with whatever is known.
 *
 * The year column is a non-null integer, so a vehicle whose year nobody
 * has ever entered reads as 0. That 0 is "unknown", not a year, so it is
 * left out of the name instead of rendering a bare 0 in front of the make
 * ("0 Ford Edge"). The vehicle form keeps years above 1900, but restores
 * of older backups and third-party imports can still carry a 0, and those
 * rows stay in the workshop until somebody fixes them. Rows read from an
 * import may also hold the year as text, so a string is accepted as well.
 */
export function vehicleName(
  vehicle: {
    year?: number | string | null
    make?: string | null
    model?: string | null
  },
  separator = ' '
): string {
  const rawYear = vehicle.year
  const year = rawYear === null || rawYear === undefined ? null : String(rawYear).trim()
  const parts = [year === '0' ? null : year, vehicle.make, vehicle.model].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== ''
  )
  return parts.join(separator)
}
