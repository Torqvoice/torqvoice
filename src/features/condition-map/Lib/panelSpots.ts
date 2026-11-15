import {
  type BodyDrawing,
  mirrorPanel,
  type Panel,
  VIEW_SIZE,
  VIEWS,
  type View,
} from './drawingTypes'
import { IDENTITY, transformPath } from './pathTransform'

/**
 * A panel of a view, and the spot a mark lands on when it is put there
 * without a pointer: from the Add mark button, or the editor's Panel field.
 * `x` and `y` are a mark's stored position, a fraction of the view's box.
 */
export interface PanelSpot {
  view: View
  panel: Panel
  x: number
  y: number
}

type Point = [number, number]

/** How many straight pieces a curve or an arc is cut into. Outlines are small. */
const STEPS = 12

/** An SVG arc from its end points, as points along it (the SVG spec's F.6.5). */
function arcPoints(
  from: Point,
  rx: number,
  ry: number,
  turn: number,
  large: boolean,
  sweep: boolean,
  to: Point
): Point[] {
  if (rx === 0 || ry === 0) return [to]
  const phi = (turn * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from[0] - to[0]) / 2
  const dy = (from[1] - to[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  let a = Math.abs(rx)
  let b = Math.abs(ry)
  const stretch = (x1 * x1) / (a * a) + (y1 * y1) / (b * b)
  if (stretch > 1) {
    a *= Math.sqrt(stretch)
    b *= Math.sqrt(stretch)
  }
  const top = a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1
  const bottom = a * a * y1 * y1 + b * b * x1 * x1
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, top / bottom))
  const cx1 = (k * a * y1) / b
  const cy1 = (-k * b * x1) / a
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2
  const start = Math.atan2((y1 - cy1) / b, (x1 - cx1) / a)
  let span = Math.atan2((-y1 - cy1) / b, (-x1 - cx1) / a) - start
  if (sweep && span < 0) span += 2 * Math.PI
  if (!sweep && span > 0) span -= 2 * Math.PI
  const out: Point[] = []
  for (let i = 1; i <= STEPS; i++) {
    const angle = start + (span * i) / STEPS
    out.push([
      cx + a * Math.cos(angle) * cos - b * Math.sin(angle) * sin,
      cy + a * Math.cos(angle) * sin + b * Math.sin(angle) * cos,
    ])
  }
  return out
}

/**
 * Path data as closed outlines of straight pieces, one per subpath. Curves
 * and arcs are cut fine enough to ask "is this point inside".
 */
function outlinesOf(d: string): Point[][] {
  // Through the identity first: relative commands, H and V come out as
  // absolute M, L, C, Q and A.
  const absolute = transformPath(d, IDENTITY)
  const outlines: Point[][] = []
  let current: Point[] = []
  let at: Point = [0, 0]
  const close = () => {
    if (current.length >= 3) outlines.push(current)
    current = []
  }
  for (const match of absolute.matchAll(/([MLCQAZ])([^MLCQAZ]*)/g)) {
    const n = (match[2].match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number)
    switch (match[1]) {
      case 'M':
        close()
        for (let i = 0; i + 1 < n.length; i += 2) current.push((at = [n[i], n[i + 1]]))
        break
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) current.push((at = [n[i], n[i + 1]]))
        break
      case 'Q':
        for (let i = 0; i + 3 < n.length; i += 4) {
          const [x0, y0] = at
          for (let s = 1; s <= STEPS; s++) {
            const t = s / STEPS
            const u = 1 - t
            current.push([
              u * u * x0 + 2 * u * t * n[i] + t * t * n[i + 2],
              u * u * y0 + 2 * u * t * n[i + 1] + t * t * n[i + 3],
            ])
          }
          at = [n[i + 2], n[i + 3]]
        }
        break
      case 'C':
        for (let i = 0; i + 5 < n.length; i += 6) {
          const [x0, y0] = at
          for (let s = 1; s <= STEPS; s++) {
            const t = s / STEPS
            const u = 1 - t
            current.push([
              u * u * u * x0 +
                3 * u * u * t * n[i] +
                3 * u * t * t * n[i + 2] +
                t * t * t * n[i + 4],
              u * u * u * y0 +
                3 * u * u * t * n[i + 1] +
                3 * u * t * t * n[i + 3] +
                t * t * t * n[i + 5],
            ])
          }
          at = [n[i + 4], n[i + 5]]
        }
        break
      case 'A':
        for (let i = 0; i + 6 < n.length; i += 7) {
          const to: Point = [n[i + 5], n[i + 6]]
          current.push(
            ...arcPoints(at, n[i], n[i + 1], n[i + 2], n[i + 3] === 1, n[i + 4] === 1, to)
          )
          at = to
        }
        break
      case 'Z':
        close()
        break
    }
  }
  close()
  return outlines.filter((outline) => outline.every(([x, y]) => Number.isFinite(x + y)))
}

function areaOf(outline: Point[]): number {
  let twice = 0
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    twice += x1 * y2 - x2 * y1
  }
  return Math.abs(twice) / 2
}

/** Where a horizontal line at `y` crosses an outline, left to right. */
function crossings(outline: Point[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
  }
  return xs.sort((a, b) => a - b)
}

const inside = (outline: Point[], [x, y]: Point) =>
  crossings(outline, y).filter((cross) => cross > x).length % 2 === 1

/**
 * A point that is on the outline's own surface. The middle of its box when
 * that is inside, which it is for every plain panel. A bent or hollow shape
 * (a wheel arch, a bumper that wraps a corner) has its box's middle in the
 * gap, so there the outline is cut by a few level lines and the middle of
 * the widest stretch inside it is taken.
 */
function interiorPoint(outline: Point[]): Point {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of outline) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const middle: Point = [(minX + maxX) / 2, (minY + maxY) / 2]
  if (inside(outline, middle)) return middle
  let best: { width: number; point: Point } | null = null
  const LINES = 15
  for (let line = 1; line <= LINES; line++) {
    const y = minY + ((maxY - minY) * line) / (LINES + 1)
    const xs = crossings(outline, y)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i]
      if (!best || width > best.width) best = { width, point: [(xs[i] + xs[i + 1]) / 2, y] }
    }
  }
  return best?.point ?? middle
}

/**
 * Every panel of every view of a drawing, each with a spot on the panel's own
 * surface for a mark to be put on. A panel drawn as several shapes, in one
 * path or in more (a wheel seen from above is two strips either side of the
 * fender), takes its largest shape, so the spot never lands in the gap
 * between them or on the part that sits there.
 *
 * The right side is the left drawing mirrored by the sheet, and a mark on it
 * is stored in the left drawing's coordinates, so its spots are read from the
 * left drawing with the panel renamed to its twin.
 */
export function panelSpots(drawing: BodyDrawing, views: readonly View[] = VIEWS): PanelSpot[] {
  const out: PanelSpot[] = []
  for (const view of views) {
    const source = view === 'right' ? drawing.views.left : drawing.views[view]
    const best = new Map<Panel, { area: number; outline: Point[] }>()
    for (const piece of source.panels) {
      const panel = view === 'right' ? mirrorPanel(piece.id) : piece.id
      for (const outline of outlinesOf(piece.d)) {
        const area = areaOf(outline)
        const known = best.get(panel)
        if (!known || area > known.area) best.set(panel, { area, outline })
      }
    }
    for (const [panel, { outline }] of best) {
      const [x, y] = interiorPoint(outline)
      out.push({
        view,
        panel,
        x: Math.min(1, Math.max(0, x / VIEW_SIZE)),
        y: Math.min(1, Math.max(0, y / VIEW_SIZE)),
      })
    }
  }
  return out
}

/** Whether a stored position (fractions of the view's box) is on one of the panel's shapes. */
export function isOnPanel(
  drawing: BodyDrawing,
  spot: { view: View; panel: Panel; x: number; y: number }
): boolean {
  const source = spot.view === 'right' ? drawing.views.left : drawing.views[spot.view]
  const point: Point = [spot.x * VIEW_SIZE, spot.y * VIEW_SIZE]
  return source.panels
    .filter((piece) => (spot.view === 'right' ? mirrorPanel(piece.id) : piece.id) === spot.panel)
    .some((piece) => outlinesOf(piece.d).some((outline) => inside(outline, point)))
}

/** A spot as one string, for a select's value. */
export const spotKey = (spot: { view: string; panel: string }) => `${spot.view}:${spot.panel}`
