/**
 * How many SMS a text is billed as.
 *
 * A text travels in segments. One written entirely in the GSM-7 alphabet
 * (Latin letters, digits, common punctuation and a handful of accented
 * letters, æ ø å among them) fits 160 characters, or 153 per segment once it
 * needs more than one. Anything outside that alphabet, an emoji or Cyrillic
 * say, switches the whole text to UCS-2: 70 characters, or 67 per segment.
 * Every provider bills per segment, so this is the unit a cost limit has to
 * count in.
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
/** In the alphabet, but each takes two places: an escape and the character. */
const GSM7_EXTENDED = '\f^{}\\[~]|€'

const BASIC = new Set(GSM7_BASIC)
const EXTENDED = new Set(GSM7_EXTENDED)

/** Places the text takes in GSM-7, or null when it cannot be written in it. */
function gsm7Length(text: string): number | null {
  let length = 0
  for (const char of text) {
    if (BASIC.has(char)) length += 1
    else if (EXTENDED.has(char)) length += 2
    else return null
  }
  return length
}

export function smsSegmentCount(text: string): number {
  if (text.length === 0) return 0

  const gsm = gsm7Length(text)
  if (gsm !== null) return gsm <= 160 ? 1 : Math.ceil(gsm / 153)

  // UCS-2 counts UTF-16 code units, which is what `length` already is: an
  // emoji outside the basic plane takes two.
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67)
}
