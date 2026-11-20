/**
 * How far a photo printed behind text has to be washed out for the text on
 * it to stay readable.
 *
 * The faded vehicle photo sits behind the Vehicle block's lines. Whatever the
 * picture, every pixel of it must leave the block's inks at WCAG AA contrast
 * (4.5:1), on screen and in black and white print. The photo is therefore
 * remapped so that every channel stays at or above a floor (dark inks on a
 * light block), or at or below a ceiling (light inks on a dark block).
 *
 * Relative luminance is monotonic in each sRGB channel, so a pixel whose
 * three channels are all at least v has a luminance of at least L(v, v, v),
 * and one whose channels are all at most v has at most that. A floor worked
 * out for grey therefore holds for every colour the photo can have.
 *
 * Pure, so the numbers can be checked without an image anywhere near.
 */

export type Rgb = [number, number, number]

/** The AA contrast ratio for body text. */
export const AA_CONTRAST = 4.5

/**
 * Channel steps kept clear of the limit, for the JPEG the photo is saved as:
 * its compression moves a value a step or two either way.
 */
const SAFETY = 3

/** A colour as the designer stores it: #rgb, #rrggbb or rgb(r, g, b). Null for anything else. */
export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim()
  const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(v)
  if (hex6) return [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16)]
  const hex3 = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(v)
  if (hex3) {
    return [
      parseInt(hex3[1] + hex3[1], 16),
      parseInt(hex3[2] + hex3[2], 16),
      parseInt(hex3[3] + hex3[3], 16),
    ]
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(
    v
  )
  if (rgb) {
    const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    if (channels.every((c) => c <= 255)) return channels as Rgb
  }
  return null
}

/** One 0-255 sRGB channel, linearised. */
export function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG contrast ratio between two luminances, 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** The smallest channel value whose grey is at least this luminance. */
export function floorForLuminance(luminance: number): number {
  for (let v = 0; v <= 255; v++) if (channelLuminance(v) >= luminance) return v
  return 255
}

/** The largest channel value whose grey is at most this luminance. */
export function ceilingForLuminance(luminance: number): number {
  for (let v = 255; v >= 0; v--) if (channelLuminance(v) <= luminance) return v
  return 0
}

/**
 * How the photo is remapped: every channel raised to at least `value`
 * (`floor`), or held at or below it (`ceiling`).
 */
export type PhotoTone = { mode: 'floor'; value: number } | { mode: 'ceiling'; value: number }

/**
 * The tone that keeps the block's inks readable on the photo.
 *
 * `inks` are the colours the block's text is set in (its body, label and
 * muted inks) and `background` the block's own fill. An ink that does not
 * reach AA on the plain background either cannot be rescued by any photo
 * and is left as the design has it; of the inks that do, the one closest to
 * the background in lightness sets the limit, so all of them keep AA. When
 * no ink reaches AA at all, the photo is held to the plain background's own
 * lightness, so no line reads worse than it did without the photo.
 *
 * Dark inks on a light block get a floor; light inks on a dark block, the
 * mirror, a ceiling.
 */
export function photoToneFor(inks: string[], background: string): PhotoTone {
  const bg = relativeLuminance(parseColor(background) ?? [255, 255, 255])
  const luminances = inks
    .map((ink) => parseColor(ink))
    .filter((rgb): rgb is Rgb => rgb !== null)
    .map(relativeLuminance)
  const average = luminances.length
    ? luminances.reduce((sum, l) => sum + l, 0) / luminances.length
    : 0
  const lightInks = luminances.length > 0 && average > bg
  const passing = luminances.filter((l) => contrastRatio(l, bg) >= AA_CONTRAST)

  if (!lightInks) {
    // The lightest dark ink that reads on the plain block decides how light
    // the photo must be everywhere.
    const target = passing.length ? AA_CONTRAST * (Math.max(...passing) + 0.05) - 0.05 : bg
    return { mode: 'floor', value: Math.min(255, floorForLuminance(target) + SAFETY) }
  }
  // The darkest light ink decides how dark the photo must be everywhere.
  const target = passing.length ? (Math.min(...passing) + 0.05) / AA_CONTRAST - 0.05 : bg
  return { mode: 'ceiling', value: Math.max(0, ceilingForLuminance(target) - SAFETY) }
}

/**
 * The tone as a linear map of every channel, `out = a * in + b`: 0..255 onto
 * floor..255, or onto 0..ceiling. What sharp's `linear` takes.
 */
export function linearFor(tone: PhotoTone): { a: number; b: number } {
  if (tone.mode === 'floor') return { a: (255 - tone.value) / 255, b: tone.value }
  return { a: tone.value / 255, b: 0 }
}

/** Whether one channel value obeys the tone. */
export function withinTone(channel: number, tone: PhotoTone): boolean {
  return tone.mode === 'floor' ? channel >= tone.value : channel <= tone.value
}

/**
 * The least of the photo's own range a faded photo keeps: below this it no
 * longer reads as a photo at a glance, and the label gives way instead.
 */
export const MIN_PHOTO_STRENGTH = 0.35

/**
 * The inks a Vehicle block prints in over a faded photo, and the tone the
 * photo is held to under them.
 *
 * The room for a photo a person recognises comes from the text, not from the
 * photo: the detail lines (plate, mileage, fleet number, meters) print in the
 * block's own title ink instead of its lighter detail ink, so the dark ink
 * sets the limit and the photo can be far stronger while every line keeps AA.
 * The label ("VEHICLE") keeps the design's colour while the photo can still
 * be toned for it at MIN_PHOTO_STRENGTH or more; otherwise it prints in the
 * title ink too. Either way every ink in the block reads at AA on the photo.
 */
export function fadedPhotoInks(
  text: string,
  label: string,
  background: string
): { muted: string; label: string; tone: PhotoTone } {
  const textOnly = photoToneFor([text], background)
  const labelRgb = parseColor(label)
  const bg = relativeLuminance(parseColor(background) ?? [255, 255, 255])
  if (labelRgb && contrastRatio(relativeLuminance(labelRgb), bg) >= AA_CONTRAST) {
    const both = photoToneFor([text, label], background)
    if (toneStrength(both) >= MIN_PHOTO_STRENGTH) return { muted: text, label, tone: both }
  }
  return { muted: text, label: text, tone: textOnly }
}

/** How much of the photo's own range the tone keeps, 0 to 1: its strength on the sheet. */
export function toneStrength(tone: PhotoTone): number {
  return tone.mode === 'floor' ? (255 - tone.value) / 255 : tone.value / 255
}
