import type { DrawingShape } from '@/features/invoice-designer/Spec/documentSpec'
import { getBodyDrawing } from '../Drawings'
import { type BodyType, type Panel, type View, VIEWS } from './drawingTypes'
import {
  composeViews,
  type MapViewSet,
  type MarkGlyphInput,
  markPosition,
  sheetShapes,
} from './compose'
import {
  type ConditionMarkData,
  isBodyType,
  isView,
  type MarkKind,
  type MarkScope,
  type MarkSeverity,
  numberedMarks,
  splitMarks,
} from './marks'
import { builtinMarkTypes, type MarkTypeRef, markStyleOf, markTypeOf } from './markTypes'

/**
 * The condition map as a printed document draws it: the sheet of views with
 * the marks on it, and a legend that says what each number is. Shared by the
 * certificate, the work order, the invoice, the quote and the designer's
 * sample, so they all agree.
 */

export interface ConditionMapLabels {
  views: Partial<Record<View, string>>
  panels: Partial<Record<Panel, string>>
  /** The built-in kinds' names in the reader's language. */
  kinds: Partial<Record<MarkKind, string>>
  severities: Partial<Record<MarkSeverity, string>>
  /** Appended to a legend row for a mark from an earlier visit. */
  previous: string
  /**
   * The workshop's catalogue of kinds, or a snapshot of it: what names and
   * draws each mark. Absent, the built-in kinds in their own shapes, named
   * from `kinds`.
   */
  types?: readonly MarkTypeRef[]
}

export interface ConditionMapRow {
  n: string
  area: string
  kind: string
  severity: string
  note: string
  previous: boolean
}

export interface ConditionMapPrint {
  viewBox: [number, number]
  /** Height in points at `width` points wide. */
  width: number
  height: number
  shapes: DrawingShape[]
  rows: ConditionMapRow[]
  /** How many of the rows are this sheet's own marks. */
  ownCount: number
  /** What it was drawn from, so a design can draw it again at its own size and views. */
  source: ConditionMapPrintInput
  /**
   * Set when the sheet is the empty form rather than a record: nothing was
   * marked and the design asked for a sheet to fill in by hand. Carries the
   * kinds on offer, for the key printed under the drawing.
   */
  blank?: { key: MarkTypeRef[] }
}

export interface ConditionMapPrintInput {
  bodyType: string | null | undefined
  marks: ConditionMarkData[]
  /** Which marks are this sheet's own; absent means all open marks are its own. */
  scope?: MarkScope
  /** Draw the marks still open from earlier visits, greyed. */
  includePrevious: boolean
  /**
   * Draw nothing unless this visit recorded a mark: the job's drop-off or
   * the inspection linked to it. Printing only what earlier visits found
   * made the sheet read as their report rather than this job's.
   */
  requireOwn?: boolean
  labels: ConditionMapLabels
  /** The width the drawing prints at, in points. */
  width: number
  /** Which views the sheet shows; the full sheet unless a design says otherwise. */
  views?: MapViewSet
  /**
   * With nothing to show, draw the empty sheet instead of nothing: a form
   * for a walk-round done with a pen, keyed in afterwards.
   */
  blank?: boolean
}

/**
 * What an invoice or a quote is handed to print the car's condition: the
 * marks this visit recorded, already chosen, the drawing they are on and the
 * words in the reader's language. Nothing from earlier visits: these
 * documents speak about this one.
 */
export interface VisitConditionMap {
  marks: ConditionMarkData[]
  bodyType: string | null
  labels: ConditionMapLabels
  /**
   * The job's own answer from the drop-off tab: true prints the map whether
   * or not the design has the section on, false leaves it off even when the
   * design has, and null or absent follows the design.
   */
  onInvoice?: boolean | null
}

/** An invoice's or a quote's condition map, drawn as wide as the work order's. */
export function visitConditionMapForPrint(
  map: VisitConditionMap | undefined,
  margin: number | undefined
): ConditionMapPrint | null {
  if (!map || map.marks.length === 0) return null
  return conditionMapForPrint({
    bodyType: map.bodyType,
    marks: map.marks,
    includePrevious: false,
    labels: map.labels,
    width: 515 - 2 * (margin ?? 40) + 80,
  })
}

/**
 * The sheet and its legend, or null when there is nothing to show: no
 * marks at all, or none of this sheet's and the earlier ones switched off.
 */
export function conditionMapForPrint(input: ConditionMapPrintInput): ConditionMapPrint | null {
  const body: BodyType = isBodyType(input.bodyType) ? input.bodyType : 'sedan'
  // A mark drawn on another body type is still on the car: it is listed,
  // though it has no place on this drawing. The map on screen says so.
  const open = input.marks.filter((m) => !m.resolvedAt)
  const { own, previous } = input.scope
    ? splitMarks(open, input.scope)
    : { own: open, previous: [] as ConditionMarkData[] }
  const recorded = numberedMarks([...(input.includePrevious ? previous : []), ...own])
  const nothing = (input.requireOwn && own.length === 0) || recorded.length === 0
  if (nothing && !input.blank) return null
  // The form is empty: marks from other visits are not this job's to print,
  // blank sheet or not.
  const shown = nothing ? [] : recorded

  const drawing = getBodyDrawing(body)
  const composition = composeViews(input.views ?? 'all')
  const types = input.labels.types ?? builtinMarkTypes(input.labels.kinds as Record<string, string>)
  const ownIds = new Set(own.map((m) => m.id))
  const glyphs: MarkGlyphInput[] = []
  const rows: ConditionMapRow[] = []
  shown.forEach((mark, index) => {
    const n = index + 1
    const isPrevious = !ownIds.has(mark.id)
    const at = mark.bodyType === body && isView(mark.view) ? markPosition(composition, mark) : null
    if (at) {
      glyphs.push({
        x: at[0],
        y: at[1],
        ...markStyleOf(types, mark.kind),
        severity: mark.severity as MarkSeverity,
        number: n,
        previous: isPrevious,
      })
    }
    const area = input.labels.panels[mark.panel as Panel] ?? mark.panel.replace(/_/g, ' ')
    rows.push({
      n: String(n),
      area: isPrevious ? `${area} (${input.labels.previous})` : area,
      kind: markTypeOf(types, mark.kind).name,
      severity: input.labels.severities[mark.severity as MarkSeverity] ?? mark.severity,
      note: mark.note ?? '',
      previous: isPrevious,
    })
  })

  const labels: Partial<Record<View, string>> = {}
  for (const view of VIEWS) labels[view] = input.labels.views[view] ?? view
  const shapes = sheetShapes(drawing, composition, glyphs, { labels })
  return {
    viewBox: [composition.width, composition.height],
    width: input.width,
    height: Math.round((input.width * composition.height) / composition.width),
    shapes,
    rows,
    ownCount: nothing ? 0 : own.length,
    source: input,
    ...(nothing
      ? { blank: { key: types.filter((type) => (type as { hidden?: boolean }).hidden !== true) } }
      : {}),
  }
}
