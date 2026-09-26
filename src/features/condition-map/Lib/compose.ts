import type { DrawingShape } from '@/features/invoice-designer/Spec/documentSpec'
import {
  type Affine,
  applyPoint,
  compose,
  invert,
  mirrorX,
  rotate90,
  scale,
  transformPath,
  translate,
} from './pathTransform'
import {
  type BodyDrawing,
  type DrawingView,
  mirrorPanel,
  type Panel,
  VIEW_SIZE,
  type View,
} from './drawingTypes'
import { MARK_STYLE, type MarkKind, PREVIOUS_MARK_COLOR, type MarkSeverity } from './marks'

/**
 * Five views on one sheet.
 *
 * The two sides stacked on the left, the front over the rear beside them,
 * and the plan view turned on its side at the right, the way a rental
 * check-in form lays a car out: everything on one page, nothing tiny. The
 * same arrangement serves the screen, the certificate and the work order,
 * so a mark sits in the same place everywhere it is seen.
 *
 * Coordinates here are "sheet units". Each view keeps its own 0..VIEW_SIZE
 * box, placed on the sheet by an affine transform; a mark's stored position
 * (a fraction of its view's box) goes through the same transform to land on
 * the sheet, and the inverse takes a tap back into its view.
 */

/** The band of a side or plan view that holds the vehicle: the rest is air. */
const SIDE_CROP = { y: 150, h: 700 }
/** The square of a front or rear view that holds the vehicle. */
const END_CROP = { x: 100, y: 100, s: 800 }
const GAP = 40
const LABEL_HEIGHT = 70

export interface PlacedView {
  view: View
  /** View box units to sheet units. */
  transform: Affine
  /** Where the view sits on the sheet, in sheet units. */
  box: { x: number; y: number; width: number; height: number }
}

export interface Composition {
  width: number
  height: number
  views: PlacedView[]
}

/** The arrangement for a body type; the same for every body. */
export function composeViews(): Composition {
  const sideW = VIEW_SIZE
  const sideH = SIDE_CROP.h
  const endS = END_CROP.s * (sideH / END_CROP.s) // ends scaled to the side band's height
  const endScale = sideH / END_CROP.s
  const column1 = { x: 0, w: sideW }
  const column2 = { x: sideW + GAP, w: endS }
  // The plan view stands on end: its band becomes the width, its length the height.
  const topW = SIDE_CROP.h
  const topH = VIEW_SIZE
  const column3 = { x: column2.x + column2.w + GAP, w: topW }
  const rowH = sideH + LABEL_HEIGHT
  const height = rowH * 2 + GAP
  const width = column3.x + column3.w

  const side = (view: View, row: number, mirrored: boolean): PlacedView => {
    const y = row * (rowH + GAP)
    // Crop the band, then mirror for the right side.
    let m = translate(column1.x, y - SIDE_CROP.y)
    if (mirrored) m = compose(m, mirrorX(VIEW_SIZE / 2))
    return { view, transform: m, box: { x: column1.x, y, width: sideW, height: sideH } }
  }
  const end = (view: View, row: number): PlacedView => {
    const y = row * (rowH + GAP)
    const m = compose(
      translate(column2.x - END_CROP.x * endScale, y - END_CROP.y * endScale),
      scale(endScale)
    )
    return { view, transform: m, box: { x: column2.x, y, width: endS, height: sideH } }
  }
  const top = (): PlacedView => {
    // Rotate a quarter turn clockwise: the car's nose points up. A point at
    // (x, y) in the view lands at (-y, x) before translation; the band
    // (y in 150..850) becomes x in 0..700 once shifted by the band's far edge.
    const y = (height - topH) / 2
    const m = compose(translate(column3.x + SIDE_CROP.y + SIDE_CROP.h, y), rotate90())
    return { view: 'top', transform: m, box: { x: column3.x, y, width: topW, height: topH } }
  }
  return {
    width,
    height,
    views: [side('left', 0, false), side('right', 1, true), end('front', 0), end('rear', 1), top()],
  }
}

/** The drawn view a placed view reads from: the right side is the left mirrored. */
function sourceView(drawing: BodyDrawing, view: View): DrawingView {
  if (view === 'right') return drawing.views.left
  return drawing.views[view]
}

export interface PlacedPanel {
  view: View
  panel: Panel
  d: string
}

/** Every tappable panel of every view, in sheet units. */
export function placedPanels(drawing: BodyDrawing, composition: Composition): PlacedPanel[] {
  const out: PlacedPanel[] = []
  for (const placed of composition.views) {
    const source = sourceView(drawing, placed.view)
    for (const panel of source.panels) {
      out.push({
        view: placed.view,
        panel: placed.view === 'right' ? mirrorPanel(panel.id) : panel.id,
        d: transformPath(panel.d, placed.transform),
      })
    }
  }
  return out
}

/** The decoration strokes of every view, in sheet units. */
export function placedLines(drawing: BodyDrawing, composition: Composition): string[] {
  const out: string[] = []
  for (const placed of composition.views) {
    for (const line of sourceView(drawing, placed.view).lines) {
      out.push(transformPath(line, placed.transform))
    }
  }
  return out
}

/** A mark's stored position on the sheet. */
export function markPosition(
  composition: Composition,
  mark: { view: string; x: number; y: number }
): [number, number] | null {
  const placed = composition.views.find((v) => v.view === mark.view)
  if (!placed) return null
  return applyPoint(placed.transform, mark.x * VIEW_SIZE, mark.y * VIEW_SIZE)
}

/** A point on the sheet as a position in the view under it, or null off every view. */
export function locateOnSheet(
  composition: Composition,
  px: number,
  py: number
): { view: View; x: number; y: number } | null {
  for (const placed of composition.views) {
    const { box } = placed
    if (px < box.x || px > box.x + box.width || py < box.y || py > box.y + box.height) continue
    const [vx, vy] = applyPoint(invert(placed.transform), px, py)
    const x = Math.min(1, Math.max(0, vx / VIEW_SIZE))
    const y = Math.min(1, Math.max(0, vy / VIEW_SIZE))
    return { view: placed.view, x, y }
  }
  return null
}

export interface MarkGlyphInput {
  x: number
  y: number
  kind: MarkKind
  severity: MarkSeverity
  number: number
  /** From an earlier visit: drawn in grey, still numbered. */
  previous?: boolean
  /** Stroke and glyph size in sheet units. */
  size?: number
}

/**
 * A mark as shapes: its kind's glyph, filled when major, and its number set
 * beside it. Sized in sheet units so it scales with the drawing.
 */
export function markGlyph(input: MarkGlyphInput): DrawingShape[] {
  const r = input.size ?? 26
  const { x, y } = input
  const style = MARK_STYLE[input.kind]
  const color = input.previous ? PREVIOUS_MARK_COLOR : style.color
  const filled = input.severity === 'major' && !input.previous
  const fill = filled ? color : '#ffffff'
  const strokeWidth = r * 0.22
  const shapes: DrawingShape[] = []
  switch (style.shape) {
    case 'circle':
      shapes.push({ type: 'circle', cx: x, cy: y, r, stroke: color, strokeWidth, fill })
      break
    case 'diamond':
      shapes.push({
        type: 'path',
        d: `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`,
        stroke: color,
        strokeWidth,
        fill,
      })
      break
    case 'triangle':
      shapes.push({
        type: 'path',
        d: `M${x} ${y - r}L${x + r * 0.95} ${y + r * 0.7}L${x - r * 0.95} ${y + r * 0.7}Z`,
        stroke: color,
        strokeWidth,
        fill,
      })
      break
    case 'square':
      shapes.push({
        type: 'path',
        d: `M${x - r * 0.85} ${y - r * 0.85}L${x + r * 0.85} ${y - r * 0.85}L${x + r * 0.85} ${y + r * 0.85}L${x - r * 0.85} ${y + r * 0.85}Z`,
        stroke: color,
        strokeWidth,
        fill,
      })
      break
    case 'hex': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6
        return `${x + r * Math.cos(a)} ${y + r * Math.sin(a)}`
      })
      shapes.push({ type: 'path', d: `M${pts.join('L')}Z`, stroke: color, strokeWidth, fill })
      break
    }
    case 'cross':
      shapes.push({ type: 'circle', cx: x, cy: y, r, stroke: color, strokeWidth, fill })
      shapes.push({
        type: 'path',
        d: `M${x - r * 0.5} ${y - r * 0.5}L${x + r * 0.5} ${y + r * 0.5}M${x + r * 0.5} ${y - r * 0.5}L${x - r * 0.5} ${y + r * 0.5}`,
        stroke: filled ? '#ffffff' : color,
        strokeWidth,
      })
      break
  }
  // The number sits up and to the right, in a white-backed disc so it reads
  // over any line of the drawing.
  const nx = x + r * 1.15
  const ny = y - r * 1.15
  const nr = r * 0.78
  shapes.push({
    type: 'circle',
    cx: nx,
    cy: ny,
    r: nr,
    fill: '#111827',
    stroke: '#ffffff',
    strokeWidth: r * 0.12,
  })
  shapes.push({
    type: 'text',
    x: nx,
    y: ny + nr * 0.42,
    text: String(input.number),
    size: nr * 1.25,
    fill: '#ffffff',
    bold: true,
    anchor: 'middle',
  })
  return shapes
}

export interface SheetOptions {
  /** The ink of the body outline and details. */
  ink?: string
  /** The fill of the tappable panels. */
  panelFill?: string
  /** Captions under each view, by view id; none means unlabelled. */
  labels?: Partial<Record<View, string>>
  captionColor?: string
}

/**
 * The whole sheet as shapes: the body, its details, the captions, then the
 * marks over it. What the print draws and the canvas previews.
 */
export function sheetShapes(
  drawing: BodyDrawing,
  composition: Composition,
  marks: MarkGlyphInput[],
  options: SheetOptions = {}
): DrawingShape[] {
  const ink = options.ink ?? '#111827'
  const panelFill = options.panelFill ?? '#ffffff'
  const shapes: DrawingShape[] = []
  for (const panel of placedPanels(drawing, composition)) {
    shapes.push({ type: 'path', d: panel.d, stroke: ink, strokeWidth: 3, fill: panelFill })
  }
  for (const d of placedLines(drawing, composition)) {
    shapes.push({ type: 'path', d, stroke: ink, strokeWidth: 3 })
  }
  if (options.labels) {
    for (const placed of composition.views) {
      const text = options.labels[placed.view]
      if (!text) continue
      shapes.push({
        type: 'text',
        x: placed.box.x + placed.box.width / 2,
        y: placed.box.y + placed.box.height + LABEL_HEIGHT * 0.65,
        text,
        size: 36,
        fill: options.captionColor ?? '#6b7280',
        anchor: 'middle',
      })
    }
  }
  for (const mark of marks) shapes.push(...markGlyph(mark))
  return shapes
}
