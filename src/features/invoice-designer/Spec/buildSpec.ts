import {
  getBuiltinFieldsForSection,
  type InvoiceLayoutConfig,
  type InvoiceSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { FRAMED } from '@/features/vehicles/Components/invoice-pdf/frame'
import type { Block, DocumentSpec, Node, Placement, TextStyle } from './documentSpec'

/**
 * The single description of a document.
 *
 * Everything the renderers draw comes from here: which blocks exist, which
 * fields each one shows, where they sit and what they look like. Written once
 * so the paper and the designer cannot disagree about it.
 */

export interface DocumentData {
  /** Field id to the value it prints, covering every field a layout can show. */
  fields: Record<string, string>
  logoUrl?: string
  items: {
    n: string
    qty: string
    unit: string
    desc: string
    sub?: string
    price: string
    total: string
  }[]
  findings: { severity: string; color: string; description: string; notes: string }[]
  meta: {
    title: string
    number: string
    customerNumber?: string
    date: string
    due?: string
  }
  totals: { subtotal: string; taxLabel: string; tax: string; total: string }
  notes: string
  warranty: string
  columnLabels: {
    pos: string
    qty: string
    unit: string
    description: string
    unitPrice: string
    total: string
  }
  sectionLabels: Record<string, string>
}

export interface DocumentTheme {
  primary: string
  background: string
  text: string
  muted: string
  accent: string
  companyText: string
  fontFamily: string
  fontSize: number
  margin: number
  rowPadding: number
  stripes: boolean
  stripeColor: string
  headerStyle: string
  frameSide: 'left' | 'right'
  frameBorderColor?: string
  frameShadow: boolean
  logoSize: number
}

/** Blend two colors, for deriving a secondary tone from an ink. */
export function mixColors(from: string, to: string, amount: number) {
  const parse = (hex: string) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [17, 24, 39]
  }
  const a = parse(from)
  const b = parse(to)
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount)
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`
}

/** One section's resolved look: its own overrides over the document's. */
function lookOf(section: InvoiceSection, theme: DocumentTheme) {
  const s = section.style
  const text = s?.textColor || theme.text
  return {
    text,
    muted: s?.textColor ? mixColors(text, theme.background, 0.42) : theme.muted,
    label: s?.labelColor || theme.accent,
    fill: s?.backgroundColor,
    border: s?.borderColor,
    fontSize: s?.fontSize,
    fontFamily: s?.fontFamily,
  }
}

/**
 * The fields a section shows, in the order it shows them. A section with no
 * list of its own shows all of them, which is what a layout written before the
 * choice existed means.
 */
export function sectionFields(section: InvoiceSection): string[] {
  if (!section.fields) return getBuiltinFieldsForSection(section.id).map((f) => f.id)
  return section.fields.filter((f) => f.visible).map((f) => f.id)
}

const scale = (base: number, factor: number) => Math.max(5, Math.round(base * factor * 10) / 10)

/** A labelled panel: the customer, the vehicle, the service, the bank. */
function panel(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData,
  fields: string[]
): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const boxed = section.boxed !== false
  const lines = fields.map((id) => ({ id, value: data.fields[id] })).filter((f) => !!f.value)

  const label: TextStyle = {
    color: look.label,
    fontSize: scale(size, 0.72),
    bold: true,
    uppercase: true,
    letterSpacing: 0.5,
  }

  return {
    kind: 'stack',
    id: section.id,
    gap: 2,
    style: {
      background: look.fill || (boxed ? '#f3f4f6' : undefined),
      borderColor: look.border || (boxed ? '#e3e5e9' : undefined),
      borderWidth: boxed || look.border ? 0.75 : 0,
      radius: boxed ? 3 : 0,
      padding: boxed || look.fill ? 10 : 0,
    },
    children: [
      { kind: 'text', text: data.sectionLabels[section.id] ?? section.id, style: label },
      ...lines.map<Node>((line, i) => ({
        kind: 'text',
        id: `${section.id}.${line.id}`,
        text: line.value,
        style: {
          color: i === 0 ? look.text : look.muted,
          bold: i === 0,
          fontSize: i === 0 ? size : scale(size, 0.92),
          fontFamily: look.fontFamily,
        },
      })),
    ],
  }
}

function letterhead(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = sectionFields(section)
  const framed = theme.headerStyle === 'framed'
  const banded = framed || theme.headerStyle === 'modern'

  const showLogo = fields.includes('logo') && !!data.logoUrl
  const mark: Node = showLogo
    ? {
        kind: 'image',
        id: 'header.logo',
        src: data.logoUrl as string,
        maxWidth: 220 * (theme.logoSize / 100),
        maxHeight: (banded ? 46 : 40) * (theme.logoSize / 100),
        align: theme.headerStyle === 'modern' ? 'center' : 'right',
      }
    : {
        kind: 'text',
        id: 'header.company_name',
        text: fields.includes('company_name') ? data.fields.company_name : '',
        style: {
          color: banded ? theme.companyText : look.label,
          fontSize: scale(size, 2.2),
          bold: true,
          align: theme.headerStyle === 'modern' ? 'center' : 'right',
        },
      }

  const strapline = fields
    .filter((id) =>
      ['company_address', 'company_phone', 'company_email', 'company_org_number'].includes(id)
    )
    .map((id) => data.fields[id])
    .filter(Boolean)
    .join('  ·  ')

  const below: Node[] = []
  if (fields.includes('company_slogan') && data.fields.company_slogan) {
    below.push({
      kind: 'text',
      id: 'header.company_slogan',
      text: data.fields.company_slogan,
      style: { color: look.muted, fontSize: scale(size, 1.05), align: 'right' },
    })
  }
  if (strapline) {
    below.push({
      kind: 'text',
      id: 'header.strapline',
      text: strapline,
      style: { color: look.muted, fontSize: scale(size, 0.9), align: 'right' },
    })
  }

  return {
    kind: 'stack',
    id: section.id,
    gap: 6,
    children: below.length ? [mark, ...below] : [mark],
  }
}

function documentTitle(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const cells = [
    ['Invoice No.', data.meta.number],
    data.meta.customerNumber ? ['Customer No.', data.meta.customerNumber] : null,
    ['Date', data.meta.date],
    data.meta.due ? ['Due', data.meta.due] : null,
  ].filter(Boolean) as [string, string][]

  return {
    kind: 'row',
    id: section.id,
    justify: 'between',
    align: 'end',
    children: [
      {
        node: {
          kind: 'text',
          id: 'document_title.title',
          text: data.meta.title,
          style: { fontSize: scale(size, 2.4), bold: true, color: look.text },
        },
      },
      {
        node: {
          kind: 'row',
          id: 'document_title.meta',
          style: { borderColor: look.border || look.text, borderWidth: 1, background: look.fill },
          children: cells.map(([label, value]) => ({
            node: {
              kind: 'stack',
              gap: 0,
              style: { padding: 5 },
              children: [
                {
                  kind: 'text',
                  text: label,
                  style: { color: look.muted, fontSize: scale(size, 0.62), align: 'center' },
                },
                {
                  kind: 'text',
                  text: value,
                  style: {
                    bold: true,
                    fontSize: scale(size, 0.95),
                    align: 'center',
                    color: look.text,
                  },
                },
              ],
            } as Node,
          })),
        },
      },
    ],
  }
}

function itemsTable(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const labels = data.columnLabels
  return {
    kind: 'table',
    id: section.id,
    rowPadding: theme.rowPadding,
    stripe: theme.stripes ? theme.stripeColor : undefined,
    style: { borderColor: look.border || '#eceef1' },
    headerStyle: {
      background: look.fill || look.text,
      color: look.fill ? look.label : theme.background || '#ffffff',
      fontSize: scale(size, 0.78),
      bold: true,
    },
    columns: [
      { key: 'n', label: labels.pos, width: 22 },
      { key: 'qty', label: labels.qty, width: 48, align: 'right' },
      { key: 'unit', label: labels.unit, width: 42 },
      { key: 'desc', label: labels.description, width: 'flex' },
      { key: 'price', label: labels.unitPrice, width: 74, align: 'right' },
      { key: 'total', label: labels.total, width: 74, align: 'right' },
    ],
    subKey: 'sub',
    rows: data.items.map((item) => ({ ...item })),
  }
}

function totals(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const line = (label: string, value: string, strong = false): Node => ({
    kind: 'row',
    justify: 'between',
    style: { padding: 6 },
    children: [
      {
        node: {
          kind: 'text',
          text: label,
          style: { color: strong ? look.text : look.muted, bold: strong, fontSize: size },
        },
      },
      {
        node: {
          kind: 'text',
          text: value,
          style: {
            bold: true,
            fontSize: strong ? scale(size, 1.15) : size,
            color: strong ? theme.accent : look.text,
          },
        },
      },
    ],
  })

  return {
    kind: 'row',
    id: section.id,
    justify: 'end',
    children: [
      {
        width: 250,
        node: {
          kind: 'stack',
          gap: 0,
          style: {
            borderColor: look.border || look.text,
            borderWidth: 1,
            background: look.fill,
          },
          children: [
            line(data.totals.subtotal ? 'Subtotal' : '', data.totals.subtotal),
            line(data.totals.taxLabel, data.totals.tax),
            line('Total', data.totals.total, true),
          ],
        },
      },
    ],
  }
}

function noteBlock(section: InvoiceSection, theme: DocumentTheme, body: string): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return {
    kind: 'stack',
    id: section.id,
    gap: 3,
    style: {
      background: look.fill || '#f3f4f6',
      borderColor: look.border,
      borderWidth: look.border ? 0.75 : 0,
      radius: 3,
      padding: 10,
    },
    children: [
      {
        kind: 'text',
        text: theme.headerStyle ? (section.id === 'notes' ? 'Notes' : 'Warranty') : '',
        style: { color: look.label, fontSize: scale(size, 0.72), bold: true, uppercase: true },
      },
      { kind: 'text', text: body, style: { color: look.muted, fontSize: scale(size, 0.9) } },
    ],
  }
}

function footer(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = sectionFields(section)
  const columns = [
    ['company_name', 'company_address'],
    ['company_phone', 'company_email'],
    ['bank_account', 'company_org_number'],
  ]
    .map((column) =>
      column
        .filter((id) => fields.includes(id))
        .map((id) => data.fields[id])
        .filter(Boolean)
    )
    .filter((column) => column.length > 0)

  const children: Node[] = []
  if (columns.length) {
    children.push({
      kind: 'row',
      gap: 16,
      children: columns.map((column) => ({
        width: 'flex',
        node: {
          kind: 'stack',
          gap: 1,
          children: column.map<Node>((value, i) => ({
            kind: 'text',
            text: value,
            style: { color: look.muted, fontSize: scale(size, 0.72), bold: i === 0 },
          })),
        },
      })),
    })
  }
  if (fields.includes('footer_note') && data.fields.footer_note) {
    children.push({
      kind: 'text',
      text: data.fields.footer_note,
      style: { color: look.muted, fontSize: scale(size, 0.78), align: 'center' },
    })
  }

  return {
    kind: 'stack',
    id: section.id,
    gap: 6,
    style: { borderColor: look.border || theme.accent, borderWidth: 0 },
    children,
  }
}

function findingsBlock(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return {
    kind: 'stack',
    id: section.id,
    gap: 4,
    children: [
      {
        kind: 'text',
        text: data.sectionLabels.findings ?? 'Observations',
        style: { color: look.label, bold: true, fontSize: scale(size, 1.05) },
      },
      ...data.findings.map<Node>((finding) => ({
        kind: 'row',
        gap: 10,
        children: [
          {
            width: 80,
            node: {
              kind: 'text',
              text: finding.severity,
              style: { color: finding.color, bold: true, fontSize: scale(size, 0.85) },
            },
          },
          {
            width: 'flex',
            node: {
              kind: 'text',
              text: finding.description,
              style: { bold: true, fontSize: scale(size, 0.85), color: look.text },
            },
          },
          {
            width: 'flex',
            node: {
              kind: 'text',
              text: finding.notes,
              style: { color: look.muted, fontSize: scale(size, 0.85) },
            },
          },
        ],
      })),
    ],
  }
}

/** The block for one section, or nothing when the section draws nothing. */
function blockFor(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node | null {
  switch (section.id) {
    case 'header':
      return letterhead(section, theme, data)
    case 'customer':
    case 'vehicle':
    case 'service':
    case 'bank_account':
    case 'general':
      return panel(section, theme, data, sectionFields(section))
    case 'document_title':
      return documentTitle(section, theme, data)
    case 'items_table':
    case 'parts_table':
    case 'labor_table':
      return itemsTable(section, theme, data)
    case 'findings':
      return findingsBlock(section, theme, data)
    case 'totals':
      return totals(section, theme, data)
    case 'notes':
      return noteBlock(section, theme, data.notes)
    case 'warranty':
      return noteBlock(section, theme, data.warranty)
    case 'footer':
      return footer(section, theme, data)
    default:
      return null
  }
}

export function buildDocumentSpec(
  layout: InvoiceLayoutConfig,
  theme: DocumentTheme,
  data: DocumentData
): DocumentSpec {
  const framed = theme.headerStyle === 'framed'
  const anchors = layout.anchors ?? {}

  const blocks: Block[] = []
  for (const section of [...layout.sections].sort((a, b) => a.order - b.order)) {
    if (!section.visible) continue
    const content = blockFor(section, theme, data)
    if (!content) continue

    const anchor = anchors[section.id]
    const placement: Placement = anchor
      ? { mode: 'anchored', anchor }
      : // A printed footer is held against the foot of the sheet, not left to
        // wherever the text above it happens to end.
        section.id === 'footer'
        ? { mode: 'pinned', edge: 'bottom' }
        : { mode: 'flow', order: section.order, column: section.column }

    blocks.push({
      id: section.id,
      label: section.id.replace(/_/g, ' '),
      placement,
      content,
    })
  }

  return {
    page: {
      width: 595,
      height: 842,
      margin: framed
        ? {
            top: FRAMED.padTop,
            bottom: theme.margin,
            left: theme.frameSide === 'left' ? FRAMED.padLeft + FRAMED.railWidth : theme.margin,
            right: theme.frameSide === 'right' ? FRAMED.padLeft + FRAMED.railWidth : theme.margin,
          }
        : {
            top: theme.margin,
            right: theme.margin,
            bottom: theme.margin,
            left: theme.margin,
          },
      background: theme.background,
      text: theme.text,
      muted: theme.muted,
      accent: theme.accent,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
    },
    frame: framed
      ? {
          side: theme.frameSide,
          railWidth: FRAMED.railWidth,
          bandHeight: FRAMED.bandHeight,
          color: theme.primary,
          borderColor: theme.frameBorderColor,
          shadow: theme.frameShadow,
        }
      : undefined,
    blocks,
  }
}
