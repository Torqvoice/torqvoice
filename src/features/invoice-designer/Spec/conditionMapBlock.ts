import type { InvoiceSection } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { Node } from './documentSpec'
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
import { isMapViewSet } from '@/features/condition-map/Lib/compose'

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
  if (fields.has('legend') && map.rows.length > 0) {
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
