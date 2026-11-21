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

/** Longer than this, a word is one a table column of shared width may not hold. */
export const LONG_WORD = 16

/** Whether a word is one the PDF breaks inside itself. */
export type IsLong = (word: string) => boolean
export const longByLength: IsLong = (word) => word.length > LONG_WORD

/**
 * A cell's text as the pieces a wrapping row may break between: each word
 * with the space after it, and a long word one character at a time. The PDF
 * draws each piece as its own text (BreakableText in renderPdf.tsx), and
 * lineCount packs the very same pieces, so the two never disagree on where
 * a line ends.
 */
export function wrapPieces(text: string, isLong: IsLong = longByLength): string[] {
  const pieces: string[] = []
  text.split(' ').forEach((word, i) => {
    // The space between two words stays with the first of them.
    if (i > 0 && pieces.length) pieces[pieces.length - 1] += ' '
    if (isLong(word)) pieces.push(...Array.from(word))
    else if (word) pieces.push(word)
  })
  return pieces
}

/**
 * Lines a row of pieces fills when each goes on the line it fits on, or
 * starts the next: how a wrapping row lays out its texts. A piece wider than
 * the line still takes a line of its own. The hair of slack wraps a piece
 * that fits only to the last thousandth of a point a line early rather than
 * late, so a rounding difference can only make the estimate taller.
 */
function packedLines(widths: number[], width: number): number {
  let lines = 1
  let used = 0
  for (const w of widths) {
    if (used > 0 && used + w > width - 0.001) {
      lines += 1
      used = w
    } else {
      used += w
    }
  }
  return lines
}

/**
 * How many lines a text needs at a width, the way the PDF draws it.
 *
 * Plain text wraps greedily at spaces; a word longer than the line stays
 * whole on a line of its own (react-pdf runs it past the edge rather than
 * break it). With `breakLongWords`, a text holding a word the line cannot
 * take is drawn as pieces instead (wrapPieces), and the pieces are packed
 * here one by one, each character of a long word with its own width. Never
 * by dividing a long word's width by the line's: a glyph is not split, so a
 * line holds only the whole characters that fit, and the division counted a
 * column of narrow lines as fewer than it prints.
 */
export function lineCount(
  text: string,
  width: number,
  style: TextStyle | undefined,
  baseSize: number,
  /**
   * Break inside a long word (the table's breakLongWords): true for a word
   * wider than the line, or the PDF's own test of what is long.
   */
  breakLongWords: boolean | IsLong = false
): number {
  if (!text) return 0
  if (width <= 0) return 1
  const isLong: IsLong | null =
    breakLongWords === true
      ? (word) => widthOf(word, style, baseSize) > width
      : breakLongWords || null
  // The PDF draws pieces only when a word is long; otherwise it is plain text.
  const pieces = isLong !== null && text.split(/\s+/).some(isLong)
  let lines = 0
  for (const paragraph of text.split('\n')) {
    if (pieces) {
      lines += packedLines(
        wrapPieces(paragraph, isLong).map((piece) => widthOf(piece, style, baseSize)),
        width
      )
      continue
    }
    if (!paragraph.trim()) {
      lines += 1
      continue
    }
    const spaceWidth = widthOf(' ', style, baseSize)
    let line = 0
    let used = 0
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue
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
