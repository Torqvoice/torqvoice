import type { InvoiceSection } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { DrawingShape, Node } from './documentSpec'
import {
  type DocumentData,
  type DocumentTheme,
  label,
  lookOf,
  sectionFields,
  tableHead,
} from './buildSpec'
import { headingStyle } from './certificateBlocks'
import { conditionMapForPrint } from '@/features/condition-map/Lib/print'
import { isMapViewSet, markGlyph } from '@/features/condition-map/Lib/compose'
import { type MarkTypeRef, markStyleOf } from '@/features/condition-map/Lib/markTypes'

/**
 * The vehicle's condition: the line drawing with the numbered marks on it,
 * and the legend under it saying what each one is. On a certificate it is
 * what the inspection found on the body; on a work order it is what the
 * customer acknowledges was already there when the keys changed hands.
 *
 * Draws nothing when the sheet has no marks: a clean car is a clean sheet.
 */
export function conditionMapBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const full = data.conditionMap
  if (!full) return null
  // The design's own size and views: a narrower drawing, or fewer views of
  // it, drawn again from what the full sheet was drawn from. The legend
  // keeps the row's width either way.
  const views = isMapViewSet(section.variant) ? section.variant : 'all'
  const wanted = section.style?.width
  const width = wanted ? Math.min(wanted, full.width) : full.width
  const map =
    views !== 'all' || width !== full.width
      ? (conditionMapForPrint({ ...full.source, width, views }) ?? full)
      : full
  const fields = new Set(sectionFields(section))
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const children: Node[] = []
  // The drawing is most of a page and moves to the next one whole. The
  // heading is drawn on the sheet itself, in a band above the views, so it
  // goes along rather than staying behind above a footer; drawn as a text
  // of its own it did, whatever the page-break hints said.
  const heading = section.heading !== false ? headingStyle(look, size) : null
  const unitsPerPoint = map.viewBox[0] / map.width
  const fontSize = heading?.fontSize ?? size
  const bandPoints = heading ? fontSize * 1.5 + 6 : 0
  const band = bandPoints * unitsPerPoint
  const title =
    data.sectionLabels.condition_map ?? label(data, 'conditionMapTitle', 'Vehicle condition')
  const drawing: Node = {
    kind: 'drawing',
    width: map.width,
    height: map.height + Math.ceil(bandPoints),
    viewBox: [map.viewBox[0], map.viewBox[1] + band],
    viewBoxY: -band,
    shapes: heading
      ? [
          {
            type: 'text',
            x: 0,
            y: -band + fontSize * unitsPerPoint,
            text: heading.uppercase ? title.toUpperCase() : title,
            size: fontSize * unitsPerPoint,
            fill: heading.color ?? '#111827',
            bold: heading.bold,
          },
          ...map.shapes,
        ]
      : map.shapes,
  }
  // Narrower than the row, the drawing sits where the alignment puts it.
  const align = section.style?.align ?? 'left'
  children.push(
    map.width < full.width
      ? {
          kind: 'row',
          justify: align === 'center' ? 'center' : align === 'right' ? 'end' : 'start',
          children: [{ width: map.width, node: drawing }],
        }
      : drawing
  )
  if (map.blank) {
    children.push(markKey(map.blank.key, full.width, look.muted ?? '#374151'))
    // Numbered rows to write in, matching the numbers pencilled on the drawing.
    children.push({
      kind: 'table',
      rowPadding: 9,
      ruleWidth: look.ruleWidth,
      rowBackground: theme.background || '#ffffff',
      style: {
        borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#d1d5db'),
        borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
      },
      headerStyle: tableHead(look, theme, size),
      columns: [
        { key: 'n', label: label(data, 'conditionMapNo', '#'), width: 26 },
        { key: 'area', label: label(data, 'conditionMapArea', 'Area'), width: 'flex' },
        { key: 'kind', label: label(data, 'conditionMapKind', 'Type'), width: 90 },
        { key: 'severity', label: label(data, 'conditionMapSeverity', 'Severity'), width: 60 },
        { key: 'note', label: label(data, 'conditionMapNote', 'Note'), width: 'flex' },
      ],
      rows: Array.from({ length: BLANK_ROWS }, (_, i) => ({
        n: String(i + 1),
        area: '',
        kind: '',
        severity: '',
        note: '',
      })),
    })
  } else if (fields.has('legend') && map.rows.length > 0) {
    children.push({
      kind: 'table',
      rowPadding: Math.max(2, theme.rowPadding - 1),
      ruleWidth: look.ruleWidth,
      rowBackground: theme.background || '#ffffff',
      stripe: (look.stripes ?? theme.stripes) ? theme.stripeColor : undefined,
      style: {
        borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
        borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
      },
      headerStyle: tableHead(look, theme, size),
      columns: [
        { key: 'n', label: label(data, 'conditionMapNo', '#'), width: 26 },
        { key: 'area', label: label(data, 'conditionMapArea', 'Area'), width: 'flex' },
        { key: 'kind', label: label(data, 'conditionMapKind', 'Type'), width: 90 },
        { key: 'severity', label: label(data, 'conditionMapSeverity', 'Severity'), width: 60 },
        { key: 'note', label: label(data, 'conditionMapNote', 'Note'), width: 'flex' },
      ],
      rows: map.rows.map((row) => ({
        n: row.n,
        area: row.area,
        kind: row.kind,
        severity: row.severity,
        note: row.note,
      })),
    })
  }
  return { kind: 'stack', id: section.id, gap: 6, children }
}

/** Rows a blank sheet leaves to write in; a walk-round rarely finds more. */
const BLANK_ROWS = 6

/**
 * The key of a blank sheet: each kind's symbol beside its name, four to a
 * line, so a mark made with a pen uses the shape the app will draw it with.
 */
function markKey(types: readonly MarkTypeRef[], width: number, ink: string): Node {
  const perRow = 4
  const cell = width / perRow
  const rowHeight = 16
  const shapes: DrawingShape[] = []
  types.forEach((type, index) => {
    const x = (index % perRow) * cell
    const y = Math.floor(index / perRow) * rowHeight
    // The glyph without its number: the last two shapes are the disc and digit.
    shapes.push(
      ...markGlyph({
        x: x + 7,
        y: y + 8,
        ...markStyleOf([type], type.key),
        severity: 'minor',
        number: 0,
        size: 5,
      }).slice(0, -2)
    )
    shapes.push({ type: 'text', x: x + 18, y: y + 11, text: type.name, size: 8, fill: ink })
  })
  const height = Math.max(1, Math.ceil(types.length / perRow)) * rowHeight
  return { kind: 'drawing', width, height, viewBox: [width, height], shapes }
}
