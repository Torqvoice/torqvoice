/**
 * What a phone number may be written with, in any country: digits, spaces
 * and the marks people group them with, "+47 912 34 567", "(0)20 7946 0000",
 * "030-1234.56". Letters and other signs mean something else was typed into
 * the box, and a text sent to it would go nowhere.
 */
const PHONE_CHARACTERS = /^[\d\s+\-().]+$/

/** True for a phone number as people write one; an empty box is fine. */
export function isPhoneNumber(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return true
  return PHONE_CHARACTERS.test(trimmed) && /\d/.test(trimmed)
}

/** The digits of a phone number, how two ways of writing one are compared. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/** Fewer digits than this is not enough to say two customers share a number. */
export const PHONE_MATCH_MIN_DIGITS = 5
