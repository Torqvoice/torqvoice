import type { TextStyle } from '../Spec/documentSpec'
import { FONT_WIDTHS } from './fontWidths'

/**
 * Text metrics without a browser.
 *
 * The designer measures blocks with the DOM; the printed PDF has no DOM, so
 * this measures with the advance widths of the exact font files the PDF
 * embeds. Both sides then wrap a line at the same place, which is the whole
 * complaint this answers: a slogan narrowed to two lines on screen must not
 * come back out as one long line on paper.
 */

/** The default the HTML walker uses, mirrored here and in the PDF walker. */
export const DEFAULT_LINE_HEIGHT = 1.4

function tableFor(fontFamily: string | undefined, bold: boolean) {
  const family = FONT_WIDTHS[`${fontFamily || 'Helvetica'}|${bold ? 'bold' : 'regular'}`]
  return family ?? FONT_WIDTHS['Helvetica|regular']
}

/** The width of a run of text, in points. */
export function widthOf(text: string, style: TextStyle | undefined, baseSize: number): number {
  const size = style?.fontSize ?? baseSize
  const table = tableFor(style?.fontFamily, !!style?.bold)
  const source = style?.uppercase ? text.toUpperCase() : text
  let units = 0
  for (const ch of source) {
    const code = ch.codePointAt(0) ?? 0
    units += table.widths[code] ?? table.fallback
  }
  const letterSpacing = (style?.letterSpacing ?? 0) * Math.max(0, source.length - 1)
  return (units / 1000) * size + letterSpacing
}

/**
 * How many lines a text needs at a width, wrapping greedily at spaces the way
 * both renderers do. A word longer than the line still takes its own line.
 */
export function lineCount(
  text: string,
  width: number,
  style: TextStyle | undefined,
  baseSize: number
): number {
  if (!text) return 0
  if (width <= 0) return 1
  let lines = 0
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines += 1
      continue
    }
    const spaceWidth = widthOf(' ', style, baseSize)
    let line = 0
    let used = 0
    for (const word of paragraph.split(/\s+/)) {
      const w = widthOf(word, style, baseSize)
      if (used > 0 && used + spaceWidth + w > width) {
        lines += 1
        used = w
      } else {
        used += (used > 0 ? spaceWidth : 0) + w
      }
      line = 1
    }
    lines += line
  }
  return Math.max(1, lines)
}

/** The height a text run takes at a width, in points. */
export function textHeight(
  text: string,
  width: number,
  style: TextStyle | undefined,
  baseSize: number
): number {
  const size = style?.fontSize ?? baseSize
  const lineHeight = style?.lineHeight ?? DEFAULT_LINE_HEIGHT
  return lineCount(text, width, style, baseSize) * size * lineHeight
}
