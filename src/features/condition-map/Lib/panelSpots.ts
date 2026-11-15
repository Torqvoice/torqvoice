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

/** The bounding box of path data, from its end and control points. */
function boundsOf(d: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Through the identity first: relative commands, H and V come out as
  // absolute M, L, C, Q and A, so every pair below is a point.
  const absolute = transformPath(d, IDENTITY)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const match of absolute.matchAll(/([MLCQA])([^MLCQAZ]*)/g)) {
    const nums = (match[2].match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number)
    if (match[1] === 'A') {
      // Only an arc's end point is a place on the outline; a circle drawn as
      // two half arcs still spans its full width that way.
      for (let i = 0; i + 6 < nums.length; i += 7) add(nums[i + 5], nums[i + 6])
      continue
    }
    for (let i = 0; i + 1 < nums.length; i += 2) add(nums[i], nums[i + 1])
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/**
 * Every panel of every view of a drawing, each with the centre of its
 * outline's bounding box as the spot a mark is put on. A panel drawn in more
 * than one piece takes the centre of its largest piece, so the spot sits on
 * the panel rather than in the gap between its pieces.
 *
 * The right side is the left drawing mirrored by the sheet, and a mark on it
 * is stored in the left drawing's coordinates, so its spots are read from the
 * left drawing with the panel renamed to its twin.
 */
export function panelSpots(drawing: BodyDrawing, views: readonly View[] = VIEWS): PanelSpot[] {
  const out: PanelSpot[] = []
  for (const view of views) {
    const source = view === 'right' ? drawing.views.left : drawing.views[view]
    const best = new Map<Panel, { area: number; x: number; y: number }>()
    for (const piece of source.panels) {
      const box = boundsOf(piece.d)
      if (!box) continue
      const panel = view === 'right' ? mirrorPanel(piece.id) : piece.id
      const area = (box.maxX - box.minX) * (box.maxY - box.minY)
      const known = best.get(panel)
      if (known && known.area >= area) continue
      best.set(panel, {
        area,
        x: (box.minX + box.maxX) / 2 / VIEW_SIZE,
        y: (box.minY + box.maxY) / 2 / VIEW_SIZE,
      })
    }
    for (const [panel, spot] of best) {
      out.push({
        view,
        panel,
        x: Math.min(1, Math.max(0, spot.x)),
        y: Math.min(1, Math.max(0, spot.y)),
      })
    }
  }
  return out
}

/** A spot as one string, for a select's value. */
export const spotKey = (spot: { view: string; panel: string }) => `${spot.view}:${spot.panel}`
