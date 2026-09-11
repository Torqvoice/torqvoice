/**
 * A search word read as a model year, or null when it cannot be one.
 *
 * Four digits and nothing else. Every all-digit word used to be tried as a
 * year, and a phone number with its country code (4791234567) is past what the
 * year column holds, so the database refused the whole query and the vehicle
 * list came back as an error. "1e10" and "2.5" parsed as numbers too.
 */
export function searchYear(word: string): number | null {
  return /^\d{4}$/.test(word) ? Number(word) : null
}
