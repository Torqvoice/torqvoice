/**
 * Font sets.
 *
 * Which typefaces the app is set in, chosen the way a theme is: on the
 * Appearance page, kept in this browser, and put on <html> as a class before
 * the first paint by the script in the root layout. The class swaps what the
 * font variables point at (see globals.css); nothing else has to know.
 *
 * - `default`: Geist throughout.
 * - `workshop`: the look of the work order mock. IBM Plex Sans for text, IBM
 *   Plex Mono for figures, Barlow Condensed in capitals for headings and the
 *   order number.
 * - `precise`: Inter with JetBrains Mono, for a screen that is mostly tables
 *   and figures. Inter is drawn for interfaces at small sizes and both have
 *   Cyrillic; headings are Inter Tight.
 * - `legible`: Atkinson Hyperlegible, text and mono. Drawn so that the
 *   characters people mix up (0 and O, 1 and l and I, 5 and S, 8 and B) cannot
 *   be, which is what a plate, a VIN or a part number read off a screen across
 *   a workshop needs. Latin only: Russian falls back to the system's face.
 *
 * A new set is a line here, a block in globals.css, its fonts in the root
 * layout, its id in that layout's pre-paint script, and its name in
 * settings.appearance.fonts.
 */

export type FontSetId = 'default' | 'workshop' | 'precise' | 'legible'

export const FONT_SETS: FontSetId[] = ['default', 'workshop', 'precise', 'legible']

/** Storage key shared with the pre-hydration script in the root layout. */
export const FONT_SET_STORAGE_KEY = 'torqvoice-font'

export const DEFAULT_FONT_SET: FontSetId = 'default'

export function isFontSetId(value: string | null | undefined): value is FontSetId {
  return !!value && (FONT_SETS as string[]).includes(value)
}

/** Every class this module may put on <html>. */
const ALL_FONT_SET_CLASSES = FONT_SETS.filter((id) => id !== 'default').map(
  (id) => `font-set-${id}`
)

export function applyFontSet(root: HTMLElement, id: FontSetId) {
  root.classList.remove(...ALL_FONT_SET_CLASSES)
  if (id !== 'default') root.classList.add(`font-set-${id}`)
}
