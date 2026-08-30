/**
 * Geometry of the framed sheet, kept in a module of its own so the designer can
 * read it without pulling react-pdf into the browser bundle.
 *
 * The band across the top and the rail down the edge are one shape. The page
 * inset has to clear both, and the letterhead reaches back out over them with
 * negative margins, so these numbers and that block move together.
 */
export const FRAMED = {
  bandHeight: 74,
  /** Drawn as the page's own border, so it repeats on every page for free. */
  railWidth: 26,
  padTop: 92,
  /** Padding inside the rail. The sheet's inset on that edge is this plus railWidth. */
  padLeft: 26,
  padRight: 34,
  padBottom: 54,
} as const

/**
 * The rail occupies its edge, so a margin must not be added on top of it: the
 * two would compound and push the content into the middle of the page. Only the
 * edges without frame take the margin.
 */
export type FrameSide = 'left' | 'right'

export function framedPageInset(margin: number, side: FrameSide = 'left') {
  return side === 'right'
    ? {
        paddingTop: FRAMED.padTop,
        paddingRight: FRAMED.padLeft,
        paddingLeft: margin,
        paddingBottom: margin + 20,
      }
    : {
        paddingTop: FRAMED.padTop,
        paddingLeft: FRAMED.padLeft,
        paddingRight: margin,
        paddingBottom: margin + 20,
      }
}
