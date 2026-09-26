import type { DrawingShape } from '@/features/invoice-designer/Spec/documentSpec'
import { getBodyDrawing } from '../Drawings'
import { type BodyType, type Panel, type View, VIEWS } from './drawingTypes'
import { composeViews, type MarkGlyphInput, markPosition, sheetShapes } from './compose'
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

/**
 * The condition map as a printed document draws it: the sheet of views with
 * the marks on it, and a legend that says what each number is. Shared by the
 * certificate, the work order and the designer's sample, so the three agree.
 */

export interface ConditionMapLabels {
  views: Partial<Record<View, string>>
  panels: Partial<Record<Panel, string>>
  kinds: Partial<Record<MarkKind, string>>
  severities: Partial<Record<MarkSeverity, string>>
  /** Appended to a legend row for a mark from an earlier visit. */
  previous: string
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
}

export interface ConditionMapPrintInput {
  bodyType: string | null | undefined
  marks: ConditionMarkData[]
  /** Which marks are this sheet's own; absent means all open marks are its own. */
  scope?: MarkScope
  /** Draw the marks still open from earlier visits, greyed. */
  includePrevious: boolean
  labels: ConditionMapLabels
  /** The width the drawing prints at, in points. */
  width: number
}

/**
 * The sheet and its legend, or null when there is nothing to show: no
 * marks at all, or none of this sheet's and the earlier ones switched off.
 */
export function conditionMapForPrint(input: ConditionMapPrintInput): ConditionMapPrint | null {
  const body: BodyType = isBodyType(input.bodyType) ? input.bodyType : 'sedan'
  const open = input.marks.filter((m) => !m.resolvedAt && m.bodyType === body)
  const { own, previous } = input.scope
    ? splitMarks(open, input.scope)
    : { own: open, previous: [] as ConditionMarkData[] }
  const shown = numberedMarks([...(input.includePrevious ? previous : []), ...own])
  if (shown.length === 0) return null

  const drawing = getBodyDrawing(body)
  const composition = composeViews()
  const ownIds = new Set(own.map((m) => m.id))
  const glyphs: MarkGlyphInput[] = []
  const rows: ConditionMapRow[] = []
  shown.forEach((mark, index) => {
    const n = index + 1
    const isPrevious = !ownIds.has(mark.id)
    const at = isView(mark.view) ? markPosition(composition, mark) : null
    if (at) {
      glyphs.push({
        x: at[0],
        y: at[1],
        kind: mark.kind as MarkKind,
        severity: mark.severity as MarkSeverity,
        number: n,
        previous: isPrevious,
      })
    }
    const area = input.labels.panels[mark.panel as Panel] ?? mark.panel.replace(/_/g, ' ')
    rows.push({
      n: String(n),
      area: isPrevious ? `${area} (${input.labels.previous})` : area,
      kind: input.labels.kinds[mark.kind as MarkKind] ?? mark.kind,
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
    ownCount: own.length,
  }
}
