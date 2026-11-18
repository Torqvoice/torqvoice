const ASCII_LOWER = /[a-z]/

/**
 * Upper case for one character, independent of the server's and the viewer's
 * locale. `toUpperCase` (never `toLocaleUpperCase`) maps "i" to "I" in every
 * locale, Turkish included. A letter whose upper case is more than one
 * character ("ß" becomes "SS") is left alone, so a plate never changes
 * length, and a script without case (Arabic, Thai, Chinese) passes through.
 */
function upperChar(char: string): string {
  if (ASCII_LOWER.test(char)) return char.toUpperCase()
  const upper = char.toUpperCase()
  return Array.from(upper).length === 1 ? upper : char
}

/**
 * The one form a licence plate (or a boat's registration) is stored in:
 * trimmed, runs of whitespace collapsed to a single space, letters in upper
 * case. Spaces and hyphens people typed are kept; nothing is removed. An
 * empty plate is `null`.
 */
export function normalizePlate(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return Array.from(cleaned, upperChar).join('')
}
