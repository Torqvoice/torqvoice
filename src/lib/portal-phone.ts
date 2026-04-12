/**
 * Phone normalization for the customer portal SMS sign-in flow.
 *
 * The portal accepts phone numbers from non-technical customers who don't
 * always include a country code, and existing customer records in the
 * database may also be stored without one. We normalize on read instead of
 * forcing data migration: given a workshop's default country code, we
 * derive an E.164 form for sending the SMS, and a small set of variants
 * to use when looking up the matching `Customer` row.
 *
 * No external library — pure string manipulation.
 */

/** Strip whitespace, dashes, parentheses, dots from a phone string. */
function stripPunctuation(input: string): string {
  return input.replace(/[\s\-().]/g, '')
}

/**
 * Normalize a workshop default country code to the canonical "+XX" form.
 * Accepts any of these reasonable inputs:
 *
 *   "+47"   → "+47"
 *   "47"    → "+47"
 *   "0047"  → "+47"   (00 is the international dialing prefix, same as +)
 *   " +47 " → "+47"
 *   "+1"    → "+1"
 *   "+371"  → "+371"  (Latvia, 3-digit code)
 *
 * Returns null when the input is empty, all-junk, the wrong shape, or
 * outside the 1–3 digit range that real ITU E.164 country codes use.
 */
export function normalizeCountryCode(input: string | null | undefined): string | null {
  if (!input) return null
  const stripped = stripPunctuation(input)
  if (!stripped) return null

  // 00 international prefix is equivalent to +
  let withPlus: string
  if (stripped.startsWith('+')) {
    withPlus = stripped
  } else if (stripped.startsWith('00')) {
    withPlus = `+${stripped.slice(2)}`
  } else {
    withPlus = `+${stripped}`
  }

  // Real country codes are 1–3 digits and never start with 0.
  if (!/^\+[1-9]\d{0,2}$/.test(withPlus)) return null
  return withPlus
}

/**
 * Normalize a phone string into an E.164 number using the workshop's
 * default country code as a fallback when the input has no `+` prefix.
 *
 * Returns null when the result still wouldn't be valid E.164.
 *
 *   normalizePortalPhone('+47 123 45 678', '+47') → '+4712345678'
 *   normalizePortalPhone('012 34 56 78',   '+47') → '+4712345678'
 *   normalizePortalPhone('12345678',       '+47') → '+4712345678'
 *   normalizePortalPhone('12345678',       null)  → null
 */
export function normalizePortalPhone(
  input: string,
  defaultCountryCode: string | null
): string | null {
  const stripped = stripPunctuation(input)
  if (!stripped) return null

  let e164: string
  if (stripped.startsWith('+')) {
    e164 = stripped
  } else {
    const cc = normalizeCountryCode(defaultCountryCode)
    if (!cc) return null
    // Strip a single leading 0 (NO/DE/FR/etc. trunk prefix) before
    // appending the country code.
    const local = stripped.replace(/^0+/, '')
    if (!local) return null
    e164 = `${cc}${local}`
  }

  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return null
  return e164
}

/**
 * Build the array of strings to try matching against `customer.phone`.
 *
 * Customer phone numbers in the database may have been entered before
 * E.164 normalization existed, so they could be in any of these forms:
 *   - "+4712345678" (E.164)
 *   - "12345678"    (local digits, no trunk prefix)
 *   - "012345678"   (local digits, with trunk prefix)
 * We return all plausible variants given a normalized E.164 input plus
 * the workshop's default country code.
 */
export function getPhoneLookupVariants(e164: string, defaultCountryCode: string | null): string[] {
  const variants = new Set<string>()
  variants.add(e164)

  const cc = normalizeCountryCode(defaultCountryCode)
  if (cc && e164.startsWith(cc)) {
    const local = e164.slice(cc.length)
    if (local) {
      variants.add(local)
      variants.add(`0${local}`)
    }
  }

  return Array.from(variants)
}
