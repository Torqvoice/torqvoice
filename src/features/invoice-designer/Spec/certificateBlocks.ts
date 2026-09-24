import type { InvoiceSection } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { Node, TextStyle } from './documentSpec'
import {
  type DocumentData,
  type DocumentTheme,
  label,
  lookOf,
  panel,
  scale,
  sectionFields,
  tableHead,
} from './buildSpec'

/**
 * The blocks only a certificate has. Each takes the section that placed it,
 * the sheet's theme and the document's data, like every other builder, and
 * draws nothing when the inspection has nothing for it: a clean car has no
 * defects block, an inspection with no photographs no photo block.
 */

const PHOTO_WIDTH = 158
const PHOTO_HEIGHT = 119
/** Photographs per row on an A4 sheet at the default margin. */
const PHOTOS_PER_ROW = 3

export function headingStyle(look: ReturnType<typeof lookOf>, size: number): TextStyle {
  return {
    color: look.label,
    fontSize: scale(size, 0.72),
    bold: true,
    uppercase: true,
    letterSpacing: 0.5,
  }
}

/** Photographs in rows of three, each with its caption under it. */
function photoRows(
  photos: { dataUri: string; caption?: string | null }[],
  muted: string,
  size: number
): Node[] {
  const rows: Node[] = []
  for (let i = 0; i < photos.length; i += PHOTOS_PER_ROW) {
    const slice = photos.slice(i, i + PHOTOS_PER_ROW)
    rows.push({
      kind: 'row',
      gap: 6,
      align: 'start',
      children: slice.map((photo) => ({
        width: PHOTO_WIDTH,
        node: {
          kind: 'stack',
          gap: 2,
          children: [
            {
              kind: 'image',
              src: photo.dataUri,
              maxWidth: PHOTO_WIDTH,
              maxHeight: PHOTO_HEIGHT,
              align: 'left',
            },
            ...(photo.caption
              ? [
                  {
                    kind: 'text' as const,
                    text: photo.caption,
                    style: { color: muted, fontSize: scale(size, 0.72) },
                  },
                ]
              : []),
          ],
        },
      })),
    })
  }
  return rows
}

/**
 * The outcome: a band in the result's colour, the wording and the counts.
 *
 * The designer can take the band off (the verdict then stands in its own
 * colour on the sheet), set its width and which edge it hangs from, align
 * the text, and drop the explanation or the counts.
 */
export function resultBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const certificate = data.certificate
  if (!certificate) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const { result } = certificate
  const fields = new Set(sectionFields(section))
  const boxed = section.boxed !== false
  const align = section.style?.align ?? 'left'
  const ink = boxed && !look.fill ? result.color.text : look.text
  const quiet = boxed && !look.fill ? result.color.text : look.muted

  const band: Node = {
    kind: 'stack',
    id: section.id,
    gap: 3,
    style: boxed
      ? {
          background: look.fill || result.color.bg,
          borderColor: look.border || result.color.text,
          borderWidth: look.ruleWidth ?? 0.75,
          radius: 3,
          padding: look.padding ?? 10,
        }
      : { padding: look.padding ?? 0 },
    children: [
      {
        kind: 'text',
        id: 'result.label',
        text: result.label,
        style: {
          color: boxed ? ink : result.color.text,
          fontSize: scale(size, 1.5),
          bold: true,
          align,
        },
      },
      ...(fields.has('result_detail')
        ? [
            {
              kind: 'text' as const,
              text: result.detail,
              style: { color: quiet, fontSize: scale(size, 0.92), align },
            },
          ]
        : []),
      ...(fields.has('result_summary')
        ? [
            {
              kind: 'text' as const,
              id: 'result.summary',
              text: certificate.summary,
              style: { color: quiet, fontSize: scale(size, 0.8), align },
            },
          ]
        : []),
    ],
  }

  // A set width hangs the band from the edge the alignment names; in a
  // column it takes the column, as the totals box does.
  const width = section.style?.width
  if (section.column || !width) return band
  return {
    kind: 'row',
    id: section.id,
    justify: align === 'center' ? 'center' : align === 'right' ? 'end' : 'start',
    children: [{ width, node: { ...band, id: 'result.band' } }],
  }
}

/** The facts of the test, as a labelled panel of the switched-on fields. */
export function testDetailsBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  return panel(section, theme, data, sectionFields(section))
}

/** Every check that was not OK, worst first, with the note and the photographs. */
export function defectsBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const certificate = data.certificate
  if (!certificate) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = new Set(sectionFields(section))
  const withNotes = fields.has('defect_notes')
  const withPhotos = fields.has('defect_photos')

  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text: data.sectionLabels.defects ?? label(data, 'deficiencies', 'Deficiencies found'),
      style: headingStyle(look, size),
    })
  }
  if (certificate.defects.length === 0) {
    children.push({
      kind: 'text',
      id: 'defects.none',
      text: label(data, 'noDeficiencies', 'No deficiencies were recorded.'),
      style: { color: look.muted, fontSize: scale(size, 0.92) },
    })
  }
  for (const [i, defect] of certificate.defects.entries()) {
    const lines: Node[] = [
      {
        kind: 'row',
        gap: 6,
        align: 'center',
        children: [
          {
            width: 92,
            node: {
              kind: 'stack',
              style: { background: defect.color.bg, radius: 2, padding: 3 },
              children: [
                {
                  kind: 'text',
                  text: defect.grade,
                  style: {
                    color: defect.color.text,
                    fontSize: scale(size, 0.72),
                    bold: true,
                    align: 'center',
                  },
                },
              ],
            },
          },
          {
            width: 'flex',
            node: {
              kind: 'text',
              text: defect.code ? `${defect.code}  ${defect.name}` : defect.name,
              style: { color: look.text, fontSize: size, bold: true },
            },
          },
        ],
      },
    ]
    if (withNotes && defect.notes) {
      lines.push({
        kind: 'text',
        text: defect.notes,
        style: { color: look.muted, fontSize: scale(size, 0.92) },
      })
    }
    if (withPhotos && defect.photos.length > 0) {
      lines.push(
        ...photoRows(
          defect.photos.map((dataUri) => ({ dataUri })),
          look.muted,
          size
        )
      )
    }
    children.push({
      kind: 'stack',
      id: `defects.${i}`,
      gap: 4,
      style: {
        borderColor: defect.color.text,
        borderWidth: 0,
        padding: { top: 0, right: 0, bottom: 4, left: 0 },
      },
      children: lines,
    })
  }

  return { kind: 'stack', id: section.id, gap: 6, children }
}

/**
 * Every check with its grade: a table per section, or, when the design asks
 * for one table, all of them together with a column saying which section
 * each belongs to.
 */
export function resultsTableBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const certificate = data.certificate
  if (!certificate) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = new Set(sectionFields(section))
  const keep = (row: { kind: string }) =>
    row.kind === 'defect' ||
    (row.kind === 'pass' && fields.has('passed_checks')) ||
    (row.kind === 'not_applicable' && fields.has('not_applicable_checks'))
  const withNotes = fields.has('check_notes')
  const combined = fields.has('combined_table')

  const table = (rows: Record<string, string>[], withSection: boolean): Node => ({
    kind: 'table',
    rowPadding: Math.max(2, theme.rowPadding - 2),
    ruleWidth: look.ruleWidth,
    rowBackground: theme.background || '#ffffff',
    stripe: look.stripes === true ? theme.stripeColor : undefined,
    style: {
      borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
      borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
    },
    headerStyle: tableHead(look, theme, size),
    columns: [
      { key: 'code', label: '', width: 42 },
      ...(withSection
        ? [{ key: 'section', label: label(data, 'sectionColumn', 'Section'), width: 96 }]
        : []),
      { key: 'name', label: label(data, 'item', 'Item'), width: 'flex' },
      { key: 'grade', label: label(data, 'statusColumn', 'Status'), width: 110 },
      ...(withNotes
        ? [{ key: 'notes', label: label(data, 'notesColumn', 'Notes'), width: 'flex' as const }]
        : []),
    ],
    rows,
  })
  const rowOf = (
    group: { code: string | null; name: string },
    row: (typeof certificate.sections)[number]['rows'][number]
  ) => ({
    code: row.code ?? '',
    section: group.code ? `${group.code}. ${group.name}` : group.name,
    name: row.name,
    grade: row.grade,
    notes: row.notes ?? '',
  })

  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text: data.sectionLabels.results_table ?? label(data, 'allResults', 'All results'),
      style: headingStyle(look, size),
    })
  }
  if (combined) {
    const rows = certificate.sections.flatMap((group) =>
      group.rows.filter(keep).map((row) => rowOf(group, row))
    )
    if (rows.length === 0) return null
    children.push(table(rows, true))
  } else {
    for (const group of certificate.sections) {
      const rows = group.rows.filter(keep)
      if (rows.length === 0) continue
      children.push({
        kind: 'text',
        text: group.code ? `${group.code}. ${group.name}` : group.name,
        style: { color: look.text, fontSize: scale(size, 0.9), bold: true },
      })
      children.push(
        table(
          rows.map((row) => rowOf(group, row)),
          false
        )
      )
    }
    if (children.length <= (section.heading === false ? 0 : 1)) return null
  }
  return { kind: 'stack', id: section.id, gap: 6, children }
}

/** The photographs of the vehicle as a whole. */
export function inspectionPhotosBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const certificate = data.certificate
  if (!certificate || certificate.photos.length === 0) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text: data.sectionLabels.inspection_photos ?? label(data, 'photos', 'Photos'),
      style: headingStyle(look, size),
    })
  }
  children.push(...photoRows(certificate.photos, look.muted, size))
  return { kind: 'stack', id: section.id, gap: 6, children }
}
