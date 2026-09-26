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
  const map = data.conditionMap
  if (!map) return null
  const fields = new Set(sectionFields(section))
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text:
        data.sectionLabels.condition_map ?? label(data, 'conditionMapTitle', 'Vehicle condition'),
      style: headingStyle(look, size),
    })
  }
  children.push({
    kind: 'drawing',
    width: map.width,
    height: map.height,
    viewBox: map.viewBox,
    shapes: map.shapes,
  })
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
