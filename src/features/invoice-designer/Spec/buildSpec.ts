import {
  getBuiltinFieldsForSection,
  type InvoiceLayoutConfig,
  type InvoiceSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { FRAMED } from '@/features/vehicles/Components/invoice-pdf/frame'
import type { Block, DocumentSpec, Node, Placement, TextStyle } from './documentSpec'
import { DEFAULT_LINE_HEIGHT } from '../Pdf/measure'

/**
 * The single description of a document.
 *
 * Everything the renderers draw comes from here: which blocks exist, which
 * fields each one shows, where they sit and what they look like. The designer
 * feeds it sample data and draws it in HTML; the printed invoice feeds it the
 * job and draws it in react-pdf. One generator, so the sheet on screen and
 * the sheet on paper cannot disagree about what a section contains.
 */

/** One line in the totals box. The kind decides its emphasis and color. */
export interface TotalLine {
  label: string
  value: string
  kind: 'line' | 'discount' | 'total' | 'payment' | 'due' | 'paid'
}

/** A label over a value in the payment panel. Gated ids follow the layout. */
export interface PaymentPair {
  /** A field id when the layout can toggle it, nothing when it always shows. */
  id?: string
  label: string
  value: string
}

export interface DocumentData {
  /** Field id to the value it prints, covering every field a layout can show. */
  fields: Record<string, string>
  logoUrl?: string
  /** Translated strings. Every lookup falls back to English. */
  labels: Record<string, string>
  meta: {
    title: string
    number: string
    customerNumber?: string
    date: string
    due?: string
  }
  items: {
    n: string
    qty: string
    unit: string
    desc: string
    sub?: string
    price: string
    total: string
    /** Lines the customer opted out of print struck through. */
    excluded?: boolean
  }[]
  parts: {
    ref: string
    desc: string
    qty: string
    price: string
    total: string
    excluded?: boolean
  }[]
  labor: { desc: string; qty: string; rate: string; total: string; excluded?: boolean }[]
  findings: { severity: string; color: string; description: string; notes: string }[]
  totals: TotalLine[]
  notes: { html?: string; attachedDocuments?: string[] }
  warranty: { duration?: string; expires?: string; terms?: string }
  payment: PaymentPair[]
  telegramQr?: { dataUri: string; label: string }
  /** The plan's watermark. Present means the sheet says who printed it. */
  branding?: { logoDataUri: string }
  portalUrl?: string
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
  /** Drop shadow width in points; 0 is off. */
  frameShadow: number
  /** Rounding where the rail meets the band, in points. */
  frameRadius: number
  logoSize: number
  /**
   * Draw with the pre-designer defaults: the combined letterhead, tinted
   * column heads and dark headings the retired renderer printed. Set for
   * organizations that have never saved a layout in the designer, so a deploy
   * does not restyle their documents behind their back.
   */
  classic?: boolean
}

/**
 * The stored shadow choice as a width in points. The setting has always held
 * 'true'/'false'; the named widths joined them later, so all four read.
 */
export function frameShadowWidth(value?: boolean | string): number {
  if (value === false || value === 'false') return 0
  if (value === 'thin') return 2.4
  if (value === 'wide') return 9
  return 4.5
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
    /** Panel border and table rule thickness; unset keeps the hairline. */
    ruleWidth: s?.borderWidth,
    /** A border around the whole table, not only rules between rows. */
    outerBorder: s?.outerBorder === true,
    /** Banding behind alternate rows; unset follows the sheet's setting. */
    stripes: s?.stripes,
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

/** A translated string, or the English the sheet has always printed. */
const label = (data: DocumentData, key: string, fallback: string) => data.labels[key] || fallback

/**
 * The column heads every table wears. The default is the sheet's ink reversed
 * out; classic keeps the tinted primary band with darkened primary text the
 * old sheets printed. A fill the section sets itself wins in both.
 */
function tableHead(look: ReturnType<typeof lookOf>, theme: DocumentTheme, size: number) {
  if (theme.classic && !look.fill) {
    return {
      background: mixColors(theme.background || '#ffffff', theme.primary, 0.1),
      color: mixColors(theme.primary, '#000000', 0.3),
      fontSize: scale(size, 0.78),
      bold: true,
    }
  }
  return {
    background: look.fill || look.text,
    color: look.fill ? look.label : theme.background || '#ffffff',
    fontSize: scale(size, 0.78),
    bold: true,
  }
}

/** A labelled panel: the customer, the vehicle, the service, the extras. */
function panel(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData,
  fields: string[]
): Node | null {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const boxed = section.boxed !== false
  const lines = fields.map((id) => ({ id, value: data.fields[id] })).filter((f) => !!f.value)
  if (!lines.length) return null

  const heading: TextStyle = {
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
      borderColor:
        look.border || (look.ruleWidth !== undefined ? look.muted : boxed ? '#e3e5e9' : undefined),
      borderWidth: boxed || look.border ? (look.ruleWidth ?? 0.75) : 0,
      radius: boxed ? 3 : 0,
      padding: boxed || look.fill ? 10 : 0,
    },
    children: [
      ...(section.heading === false
        ? []
        : [
            {
              kind: 'text',
              text: data.sectionLabels[section.id] ?? section.id,
              style: heading,
            } as Node,
          ]),
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

/**
 * How the Torqvoice mark is set.
 *
 * Only free plans carry it, and it is the one thing on the sheet meant to be
 * noticed rather than blend in, so the wordmark runs a step above the body
 * text instead of sitting in fine print. Kept here because the framed band
 * measures itself against these numbers.
 */
const MARK = { icon: 16, word: 1.25, label: 0.85 }

/** Where the framed letterhead sits on the band, and the air left under it. */
const FRAMED_HEADER_TOP = 14
const FRAMED_HEADER_PAD = 14
/** The gap the framed sheet keeps between the band and the first flow row. */
const FRAMED_BAND_GAP = FRAMED.padTop - FRAMED.bandHeight

/**
 * How tall the band must be to actually hold its letterhead.
 *
 * The band is painted by the page chrome at a fixed height while the
 * letterhead anchored onto it grows with the logo, the strapline and the
 * Torqvoice mark. When the content outgrew the band, the overflow kept the
 * band's white ink and printed white on the white sheet: invisible, and only
 * on the plan that shows the mark at all. Sized here rather than in the four
 * renderers, so every one of them inherits the same answer.
 */
function framedBandHeight(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): number {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = sectionFields(section)
  const line = (fontSize: number) => fontSize * DEFAULT_LINE_HEIGHT

  let height = 0
  if (fields.includes('logo') && data.logoUrl) {
    height += 46 * (theme.logoSize / 100)
  } else if (fields.includes('company_name') && data.fields.company_name) {
    height += line(scale(size, 2.2))
  }

  const hasStrapline = ['company_address', 'company_phone', 'company_email', 'company_org_number']
    .filter((id) => fields.includes(id))
    .some((id) => data.fields[id])
  if (hasStrapline) height += 6 + line(scale(size, 0.9))
  if (data.branding) height += 6 + Math.max(MARK.icon, line(scale(size, MARK.word)))

  return Math.max(FRAMED.bandHeight, Math.ceil(FRAMED_HEADER_TOP + height + FRAMED_HEADER_PAD))
}

/**
 * The letterhead as the retired PDF components drew it, for organizations
 * that have never saved a layout in the designer. The title, the number and
 * the dates live inside this header, exactly where they always printed, so
 * classic sheets never carry a separate document title block.
 */
function classicLetterhead(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node {
  const look = lookOf(section, theme)
  const fields = sectionFields(section)
  const ls = theme.logoSize / 100
  const compact = theme.headerStyle === 'compact'
  const modern = theme.headerStyle === 'modern'

  const dueLine = data.meta.due
    ? data.labels.due
      ? data.labels.due.replace('{date}', data.meta.due)
      : `Due: ${data.meta.due}`
    : ''

  // The company column, field by field in the section's order, each line the
  // size and ink the old sheets gave it.
  const bandInk = (soft: string) => (modern ? soft : look.muted)
  const companyLines = (align: 'left' | 'center'): Node[] =>
    fields
      .map((id): Node | null => {
        const value = data.fields[id]
        switch (id) {
          case 'logo':
            return data.logoUrl
              ? {
                  kind: 'image',
                  id: 'header.logo',
                  src: data.logoUrl,
                  maxWidth: (compact ? 40 : modern ? 50 : 150) * ls,
                  maxHeight: (compact ? 40 : modern ? 50 : 60) * ls,
                  align,
                }
              : null
          case 'company_name':
            return value
              ? {
                  kind: 'text',
                  id: 'header.company_name',
                  text: value,
                  style: {
                    color: theme.companyText,
                    fontSize: compact ? 16 : 22,
                    bold: true,
                    align,
                  },
                }
              : null
          case 'company_address':
            return value
              ? {
                  kind: 'text',
                  id: 'header.company_address',
                  text: value,
                  style: {
                    color: bandInk('rgba(255,255,255,0.8)'),
                    fontSize: compact ? 8 : 9,
                    align,
                  },
                }
              : null
          case 'company_phone':
          case 'company_email':
          case 'company_org_number':
            return value
              ? {
                  kind: 'text',
                  id: `header.${id}`,
                  text: value,
                  style: { color: bandInk('rgba(255,255,255,0.7)'), fontSize: 8, align },
                }
              : null
          default:
            return null
        }
      })
      .filter(Boolean) as Node[]

  // Each letterhead put the mark somewhere different: standard under the
  // company block on the left, compact right-aligned below the rule, the
  // banner centred inside it. Sizes differed with them.
  const brandingRow = (
    justify: 'start' | 'center' | 'end',
    { soft, fontSize = 11, icon = 16 }: { soft?: string; fontSize?: number; icon?: number } = {}
  ): Node[] =>
    data.branding
      ? [
          {
            kind: 'row',
            id: 'header.branding',
            gap: 3,
            justify,
            align: 'center',
            children: [
              {
                node: {
                  kind: 'image',
                  src: data.branding.logoDataUri,
                  maxWidth: icon,
                  maxHeight: icon,
                },
              },
              {
                node: {
                  kind: 'text',
                  text: 'Torqvoice',
                  style: { color: soft ?? look.muted, fontSize, bold: true },
                },
              },
            ],
          },
        ]
      : []

  // The right column: the document's own identity, right where a customer's
  // eye has always found it.
  const metaColumn = (titleSize: number): Node => ({
    kind: 'stack',
    id: 'header.meta',
    gap: 3,
    children: [
      {
        kind: 'text',
        id: 'header.title',
        text: data.meta.title,
        style: { fontSize: titleSize, bold: true, color: look.text, align: 'right' },
      },
      ...[data.meta.number, data.meta.date, dueLine].filter(Boolean).map<Node>((line, i) => ({
        kind: 'text',
        id: `header.meta_${i}`,
        text: line,
        style: { fontSize: 9, color: look.muted, align: 'right' },
      })),
    ],
  })

  if (modern) {
    return {
      kind: 'stack',
      id: section.id,
      gap: 12,
      children: [
        {
          kind: 'stack',
          id: 'header.banner',
          gap: 3,
          style: { background: look.fill || theme.primary, padding: 20, radius: 4 },
          children: [
            ...companyLines('center'),
            ...brandingRow('center', { soft: 'rgba(255,255,255,0.7)' }),
          ],
        },
        {
          kind: 'row',
          id: 'header.title_row',
          justify: 'between',
          align: 'center',
          children: [
            {
              node: {
                kind: 'text',
                id: 'header.title',
                text: data.meta.title,
                style: { fontSize: 18, bold: true, color: look.text },
              },
            },
            {
              node: {
                kind: 'row',
                id: 'header.meta',
                gap: 16,
                children: [data.meta.number, data.meta.date, dueLine]
                  .filter(Boolean)
                  .map((line) => ({
                    node: {
                      kind: 'text',
                      text: line,
                      style: { fontSize: 9, color: look.muted },
                    } as Node,
                  })),
              },
            },
          ],
        },
      ],
    }
  }

  return {
    kind: 'stack',
    id: section.id,
    gap: 0,
    children: [
      {
        kind: 'row',
        id: 'header.columns',
        justify: 'between',
        children: [
          {
            node: {
              kind: 'stack',
              id: 'header.company',
              gap: 2,
              children: [
                ...companyLines('left'),
                // Standard sets the mark under the company block; compact
                // carries it below the rule instead, so it waits.
                ...(compact ? [] : brandingRow('start', { fontSize: 12, icon: 18 })),
              ],
            },
          },
          { node: metaColumn(compact ? 14 : 18) },
        ],
      },
      { kind: 'spacer', height: compact ? 10 : 15 },
      // The rule the old sheets closed the letterhead with: a hairline for
      // compact, a heavy primary stroke for standard.
      {
        kind: 'stack',
        id: 'header.rule',
        style: { background: compact ? look.border || '#e5e7eb' : theme.primary },
        children: [{ kind: 'spacer', height: compact ? 1 : 3 }],
      },
      ...(compact ? [{ kind: 'spacer', height: 6 } as Node, ...brandingRow('end')] : []),
    ],
  }
}

function letterhead(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  if (theme.classic) return classicLetterhead(section, theme, data)
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const fields = sectionFields(section)
  const framed = theme.headerStyle === 'framed'
  const modern = theme.headerStyle === 'modern'
  const compact = theme.headerStyle === 'compact'
  const banded = framed || modern
  // Compact reads like a form's letterhead: small mark on the left with a
  // rule beneath. Standard sets the mark large on the right.
  const align = modern ? ('center' as const) : compact ? ('left' as const) : ('right' as const)

  const showLogo = fields.includes('logo') && !!data.logoUrl
  // The company name follows the section's own ink when the layout sets one,
  // then the template's company color: "the text is always white" was this
  // line ignoring both.
  const nameColor =
    section.style?.labelColor ||
    section.style?.textColor ||
    (banded ? theme.companyText : look.label)
  const logoMark: Node | null = showLogo
    ? {
        kind: 'image',
        id: 'header.logo',
        src: data.logoUrl as string,
        maxWidth: (compact ? 140 : 220) * (theme.logoSize / 100),
        maxHeight: (banded ? 46 : compact ? 28 : 40) * (theme.logoSize / 100),
        align,
      }
    : null
  const nameMark: Node | null =
    fields.includes('company_name') && data.fields.company_name
      ? {
          kind: 'text',
          id: 'header.company_name',
          text: data.fields.company_name,
          style: {
            color: nameColor,
            // Beside a logo the name is a caption; alone it is the mark, and
            // compact keeps even the mark modest.
            fontSize: scale(size, showLogo && modern ? 1.4 : compact ? 1.5 : 2.2),
            bold: true,
            align,
          },
        }
      : null
  // The banner shows everything it is given; the other letterheads show one
  // mark, because a logo already is the name set in its own type.
  const marks: Node[] = modern
    ? ([logoMark, nameMark].filter(Boolean) as Node[])
    : ([logoMark ?? nameMark].filter(Boolean) as Node[])

  const strapline = fields
    .filter((id) =>
      ['company_address', 'company_phone', 'company_email', 'company_org_number'].includes(id)
    )
    .map((id) => data.fields[id])
    .filter(Boolean)
    .join('  ·  ')

  // On a colored band the secondary lines print in softened band ink, not in
  // the sheet's gray, which would sink into the color. An ink the section
  // sets itself still wins.
  const mutedOnBand = banded && !section.style?.textColor ? 'rgba(255,255,255,0.85)' : look.muted
  const below: Node[] = []
  if (strapline) {
    below.push({
      kind: 'text',
      id: 'header.strapline',
      text: strapline,
      style: { color: mutedOnBand, fontSize: scale(size, compact ? 0.8 : 0.9), align },
    })
  }
  if (compact) {
    // The rule that separates a compact letterhead from the document.
    below.push({
      kind: 'stack',
      id: 'header.rule',
      style: { background: look.border || '#e5e7eb' },
      children: [{ kind: 'spacer', height: 1 }],
    })
  }
  if (data.branding) {
    below.push({
      kind: 'row',
      id: 'header.branding',
      gap: 3,
      justify: modern ? 'center' : 'end',
      align: 'center',
      children: [
        {
          node: {
            kind: 'text',
            text: label(data, 'poweredBy', 'Powered by'),
            style: { color: mutedOnBand, fontSize: scale(size, MARK.label) },
          },
        },
        {
          node: {
            kind: 'image',
            src: data.branding.logoDataUri,
            maxWidth: MARK.icon,
            maxHeight: MARK.icon,
          },
        },
        {
          node: {
            kind: 'text',
            text: 'Torqvoice',
            style: { color: mutedOnBand, fontSize: scale(size, MARK.word), bold: true },
          },
        },
      ],
    })
  }

  return {
    kind: 'stack',
    id: section.id,
    gap: 6,
    // The modern letterhead is its own colored banner; framed sits on the
    // band the page chrome paints. A fill set on the section wins everywhere,
    // which is what the Fill control doing nothing on the header used to lack.
    style: modern
      ? { background: look.fill || theme.primary, padding: 16, radius: 4 }
      : look.fill
        ? { background: look.fill, padding: 10, radius: 3 }
        : undefined,
    children: [...marks, ...below],
  }
}

/**
 * The slogan on its own: no longer a line the header happens to carry, so it
 * can be paired, dragged and given a width like any other block.
 */
function sloganBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.fields.company_slogan) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return {
    kind: 'text',
    id: section.id,
    text: data.fields.company_slogan,
    // No italic: the sheets embed no italic faces, so the screen must not
    // promise a slant the paper cannot print.
    style: {
      color: look.text === theme.text ? look.muted : look.text,
      fontSize: scale(size, 1.05),
      align: 'right',
      fontFamily: look.fontFamily,
    },
  }
}

function documentTitle(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const cells = [
    [label(data, 'invoiceNumberLabel', 'Invoice No.'), data.meta.number],
    data.meta.customerNumber
      ? [label(data, 'customerNumberLabel', 'Customer No.'), data.meta.customerNumber]
      : null,
    [label(data, 'dateLabel', 'Date'), data.meta.date],
    data.meta.due ? [label(data, 'dueDateLabel', 'Due'), data.meta.due] : null,
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
          children: cells.map(([cellLabel, value]) => ({
            node: {
              kind: 'stack',
              gap: 0,
              style: { padding: 5 },
              children: [
                {
                  kind: 'text',
                  text: cellLabel,
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

/** The one numbered list of everything on the job. */
function itemsTable(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.items.length) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return {
    kind: 'table',
    id: section.id,
    rowPadding: theme.rowPadding,
    ruleWidth: look.ruleWidth,
    rowBackground: theme.background || '#ffffff',
    stripe: (look.stripes ?? theme.stripes) ? theme.stripeColor : undefined,
    style: {
      // The hairline default is nearly invisible ink; a custom width without
      // a chosen color would look like nothing happened, so it takes the
      // section's muted ink instead.
      borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
      borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
    },
    headerStyle: tableHead(look, theme, size),
    columns: [
      { key: 'n', label: label(data, 'pos', '#'), width: 22 },
      { key: 'qty', label: label(data, 'qty', 'Qty'), width: 48, align: 'right' },
      { key: 'unit', label: label(data, 'unitOfMeasure', 'Unit'), width: 42 },
      { key: 'desc', label: label(data, 'description', 'Description'), width: 'flex' },
      { key: 'price', label: label(data, 'unitPrice', 'Unit price'), width: 74, align: 'right' },
      { key: 'total', label: label(data, 'total', 'Total'), width: 74, align: 'right' },
    ],
    subKey: 'sub',
    strikeKey: 'struck',
    rows: data.items.map((item) => ({
      n: item.n,
      qty: item.qty,
      unit: item.unit,
      desc: item.desc,
      sub: item.sub ?? '',
      price: item.price,
      total: item.total,
      struck: item.excluded ? '1' : '',
    })),
  }
}

/** A titled table, for the split parts and labor lists and the findings. */
function titledTable(
  section: InvoiceSection,
  theme: DocumentTheme,
  title: string,
  intro: string | undefined,
  table: Node
): Node {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text: title,
      // Classic headings print in the sheet's own dark ink, at the size the
      // old sheets set them.
      style: theme.classic
        ? { color: look.text, bold: true, fontSize: scale(size, 1.2) }
        : { color: look.label, bold: true, fontSize: scale(size, 1.05) },
    })
  }
  if (intro) {
    children.push({
      kind: 'text',
      text: intro,
      style: { color: look.muted, fontSize: scale(size, 0.85) },
    })
  }
  children.push(table)
  return { kind: 'stack', id: section.id, gap: 4, children }
}

function partsTable(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.parts.length) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return titledTable(section, theme, label(data, 'parts', 'Parts'), undefined, {
    kind: 'table',
    rowPadding: theme.rowPadding,
    ruleWidth: look.ruleWidth,
    rowBackground: theme.background || '#ffffff',
    stripe: (look.stripes ?? theme.stripes) ? theme.stripeColor : undefined,
    style: {
      // The hairline default is nearly invisible ink; a custom width without
      // a chosen color would look like nothing happened, so it takes the
      // section's muted ink instead.
      borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
      borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
    },
    headerStyle: tableHead(look, theme, size),
    columns: [
      { key: 'ref', label: label(data, 'partNumber', 'Part #'), width: 76 },
      { key: 'desc', label: label(data, 'description', 'Description'), width: 'flex' },
      { key: 'qty', label: label(data, 'qty', 'Qty'), width: 50, align: 'right' },
      { key: 'price', label: label(data, 'unitPrice', 'Unit price'), width: 74, align: 'right' },
      { key: 'total', label: label(data, 'total', 'Total'), width: 74, align: 'right' },
    ],
    strikeKey: 'struck',
    rows: data.parts.map((p) => ({
      ref: p.ref,
      desc: p.desc,
      qty: p.qty,
      price: p.price,
      total: p.total,
      struck: p.excluded ? '1' : '',
    })),
  })
}

function laborTable(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.labor.length) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return titledTable(section, theme, label(data, 'labor', 'Labor'), undefined, {
    kind: 'table',
    rowPadding: theme.rowPadding,
    ruleWidth: look.ruleWidth,
    rowBackground: theme.background || '#ffffff',
    stripe: (look.stripes ?? theme.stripes) ? theme.stripeColor : undefined,
    style: {
      // The hairline default is nearly invisible ink; a custom width without
      // a chosen color would look like nothing happened, so it takes the
      // section's muted ink instead.
      borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
      borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
    },
    headerStyle: tableHead(look, theme, size),
    columns: [
      { key: 'desc', label: label(data, 'description', 'Description'), width: 'flex' },
      { key: 'qty', label: label(data, 'qtyOrHours', 'Qty / Hours'), width: 70, align: 'right' },
      { key: 'rate', label: label(data, 'rate', 'Rate'), width: 80, align: 'right' },
      { key: 'total', label: label(data, 'total', 'Total'), width: 74, align: 'right' },
    ],
    strikeKey: 'struck',
    rows: data.labor.map((l) => ({
      desc: l.desc,
      qty: l.qty,
      rate: l.rate,
      total: l.total,
      struck: l.excluded ? '1' : '',
    })),
  })
}

function findingsBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.findings.length) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return titledTable(
    section,
    theme,
    data.sectionLabels.findings ?? label(data, 'findings', 'Findings'),
    label(
      data,
      'findingsDescription',
      'The following items were observed during this service and may require attention.'
    ),
    {
      kind: 'table',
      rowPadding: theme.rowPadding,
      ruleWidth: look.ruleWidth,
      rowBackground: theme.background || '#ffffff',
      stripe: look.stripes === true ? theme.stripeColor : undefined,
      style: {
        borderColor: look.border || (look.ruleWidth !== undefined ? look.muted : '#eceef1'),
        borderWidth: look.outerBorder ? (look.ruleWidth ?? 0.75) : 0,
      },
      headerStyle: tableHead(look, theme, size),
      columns: [
        { key: 'severity', label: label(data, 'findingSeverityLabel', 'Severity'), width: 80 },
        { key: 'description', label: label(data, 'description', 'Description'), width: 'flex' },
        { key: 'notes', label: label(data, 'findingNotesLabel', 'Notes'), width: 'flex' },
      ],
      rows: data.findings.map((f) => ({
        severity: f.severity,
        description: f.description,
        notes: f.notes || '-',
      })),
    }
  )
}

function totals(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node | null {
  if (!data.totals.length) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize

  const line = (entry: TotalLine): Node => {
    const emphasized = entry.kind === 'total' || entry.kind === 'due' || entry.kind === 'paid'
    const valueColor =
      entry.kind === 'discount'
        ? '#dc2626'
        : entry.kind === 'payment'
          ? '#059669'
          : entry.kind === 'paid'
            ? '#059669'
            : emphasized
              ? theme.accent
              : look.text
    return {
      kind: 'row',
      justify: 'between',
      style: {
        padding: 6,
        background:
          entry.kind === 'due' || entry.kind === 'paid'
            ? mixColors(theme.background, entry.kind === 'paid' ? '#059669' : theme.accent, 0.08)
            : undefined,
      },
      children: [
        {
          node: {
            kind: 'text',
            text: entry.label,
            style: {
              color: emphasized ? look.text : look.muted,
              bold: emphasized,
              fontSize: entry.kind === 'payment' ? scale(size, 0.85) : size,
            },
          },
        },
        {
          node: {
            kind: 'text',
            text: entry.value,
            style: {
              bold: true,
              fontSize: emphasized ? scale(size, 1.15) : size,
              color: valueColor,
            },
          },
        },
      ],
    }
  }

  const box: Node = {
    kind: 'stack',
    gap: 0,
    style: {
      borderColor: look.border || look.text,
      borderWidth: look.ruleWidth ?? 1,
      background: look.fill,
    },
    children: data.totals.map(line),
  }
  // Full width, the box keeps to the right the way a sum column reads; in a
  // half-width lane it takes the lane.
  const children: Node[] = [
    section.column
      ? box
      : {
          kind: 'row',
          justify: 'end',
          children: [{ width: 250, node: box }],
        },
  ]

  if (data.branding) {
    children.push({
      kind: 'row',
      gap: 3,
      align: 'center',
      children: [
        {
          node: {
            kind: 'text',
            text: label(data, 'poweredBy', 'Powered by'),
            style: { color: look.muted, fontSize: scale(size, MARK.label) },
          },
        },
        {
          node: {
            kind: 'image',
            src: data.branding.logoDataUri,
            maxWidth: MARK.icon,
            maxHeight: MARK.icon,
          },
        },
        {
          node: {
            kind: 'text',
            text: 'Torqvoice',
            style: { color: theme.primary, fontSize: scale(size, MARK.word), bold: true },
          },
        },
      ],
    })
  }

  return { kind: 'stack', id: section.id, gap: 6, children }
}

function notesBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const hasNotes = !!data.notes.html && data.notes.html.replace(/<[^>]*>/g, '').trim().length > 0
  const attached = data.notes.attachedDocuments ?? []
  if (!hasNotes && !attached.length) return null

  const children: Node[] = []
  if (hasNotes) {
    if (section.heading !== false) {
      children.push({
        kind: 'text',
        text: label(data, 'notes', 'Notes'),
        style: { color: look.label, fontSize: scale(size, 0.72), bold: true, uppercase: true },
      })
    }
    children.push({
      kind: 'richtext',
      html: data.notes.html as string,
      style: { color: look.muted, fontSize: scale(size, 0.9) },
    })
  }
  if (attached.length) {
    children.push({
      kind: 'text',
      text: label(data, 'attachedDocuments', 'Attached Documents'),
      style: { color: look.label, fontSize: scale(size, 0.72), bold: true, uppercase: true },
    })
    for (const name of attached) {
      children.push({
        kind: 'text',
        text: name,
        style: { color: look.muted, fontSize: scale(size, 0.9) },
      })
    }
  }

  const boxed = section.boxed !== false
  return {
    kind: 'stack',
    id: section.id,
    gap: 3,
    style: {
      background: look.fill || (boxed ? '#f3f4f6' : undefined),
      borderColor: look.border,
      borderWidth: look.border ? (look.ruleWidth ?? 0.75) : 0,
      radius: boxed ? 3 : 0,
      padding: boxed || look.fill ? 10 : 0,
    },
    children,
  }
}

function warrantyBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const { duration, expires, terms } = data.warranty
  if (!duration && !terms) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize

  const children: Node[] = []
  if (section.heading !== false) {
    children.push({
      kind: 'text',
      text: label(data, 'warrantyTitle', 'Warranty'),
      style: { color: look.label, fontSize: scale(size, 0.72), bold: true, uppercase: true },
    })
  }
  if (duration) {
    children.push({
      kind: 'text',
      text: `${label(data, 'warrantyDuration', 'Duration')}: ${duration}`,
      style: { color: look.text, fontSize: scale(size, 0.9), bold: true },
    })
  }
  if (expires) {
    children.push({
      kind: 'text',
      text: `${label(data, 'warrantyExpires', 'Expires')}: ${expires}`,
      style: { color: look.muted, fontSize: scale(size, 0.9) },
    })
  }
  if (terms) {
    children.push({
      kind: 'text',
      text: terms,
      style: { color: look.muted, fontSize: scale(size, 0.9) },
    })
  }

  const boxed = section.boxed !== false
  return {
    kind: 'stack',
    id: section.id,
    gap: 3,
    style: {
      background: look.fill || (boxed ? '#f3f4f6' : undefined),
      borderColor: look.border,
      borderWidth: look.border ? (look.ruleWidth ?? 0.75) : 0,
      radius: boxed ? 3 : 0,
      padding: boxed || look.fill ? 10 : 0,
    },
    children,
  }
}

/** The payment panel: bank account, org number, terms and due date. */
function paymentBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  const fields = new Set(sectionFields(section))
  const pairs = data.payment.filter((pair) => (pair.id ? fields.has(pair.id) : true))
  if (!pairs.length) return null

  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  const framed = theme.headerStyle === 'framed'
  // The looks the panel can be set to. Unset keeps what each sheet has always
  // printed: an outline on the framed sheet, the accent card elsewhere.
  const variant = section.variant || (framed ? 'outline' : 'accent')

  const inline = variant === 'lines'
  const cell = (pair: PaymentPair): Node =>
    inline
      ? {
          kind: 'row',
          gap: 4,
          children: [
            {
              node: {
                kind: 'text',
                text: `${pair.label}:`,
                style: { color: look.muted, fontSize: scale(size, 0.85) },
              },
            },
            {
              node: {
                kind: 'text',
                text: pair.value,
                style: { color: look.text, bold: true, fontSize: scale(size, 0.9) },
              },
            },
          ],
        }
      : {
          kind: 'stack',
          gap: 1,
          children: [
            {
              kind: 'text',
              text: pair.label,
              style: { color: look.muted, fontSize: scale(size, 0.78) },
            },
            {
              kind: 'text',
              text: pair.value,
              style: { color: look.text, bold: true, fontSize: size },
            },
          ],
        }

  const rows: Node[] = []
  if (inline) {
    rows.push(...pairs.map(cell))
  } else {
    for (let i = 0; i < pairs.length; i += 2) {
      rows.push({
        kind: 'row',
        gap: 12,
        children: pairs
          .slice(i, i + 2)
          .map((pair) => ({ width: 'flex' as const, node: cell(pair) })),
      })
    }
  }

  const boxStyle =
    variant === 'accent'
      ? {
          background: look.fill || mixColors(theme.background, theme.primary, 0.08),
          borderColor: look.border || theme.primary,
          borderWidth: 1,
          radius: 4,
          padding: 12,
        }
      : variant === 'panel'
        ? {
            background: look.fill || '#f3f4f6',
            borderColor: look.border || '#e3e5e9',
            borderWidth: 0.75,
            radius: 3,
            padding: 10,
          }
        : variant === 'outline'
          ? {
              background: look.fill,
              borderColor: look.border || look.text,
              borderWidth: 0.5,
              padding: 10,
            }
          : // 'lines': nothing but the type.
            { background: look.fill }

  return {
    kind: 'stack',
    id: section.id,
    gap: 6,
    style: boxStyle,
    children: [
      ...(section.heading === false
        ? []
        : [
            {
              kind: 'text',
              text:
                data.sectionLabels.bank_account ??
                label(data, 'paymentInformation', 'Payment Information'),
              style: {
                color: look.label || theme.primary,
                fontSize: scale(size, 0.78),
                bold: true,
                uppercase: true,
                letterSpacing: 0.5,
              },
            } as Node,
          ]),
      ...rows,
    ],
  }
}

function telegramBlock(
  section: InvoiceSection,
  theme: DocumentTheme,
  data: DocumentData
): Node | null {
  if (!data.telegramQr) return null
  const look = lookOf(section, theme)
  const size = look.fontSize ?? theme.fontSize
  return {
    kind: 'stack',
    id: section.id,
    gap: 4,
    style:
      section.boxed !== false
        ? { background: look.fill || '#fafafa', radius: 6, padding: 10 }
        : { background: look.fill },
    children: [
      { kind: 'image', src: data.telegramQr.dataUri, maxWidth: 56, maxHeight: 56, align: 'center' },
      {
        kind: 'text',
        text: data.telegramQr.label,
        style: { color: look.muted, fontSize: scale(size, 0.72), align: 'center' },
      },
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
  // A shop that wants its mark along the bottom as well as the top, the way
  // printed stationery often carries it. Sized against the footer's own text
  // rather than the header's slider, which belongs to the letterhead.
  if (fields.includes('logo') && data.logoUrl) {
    children.push({
      kind: 'image',
      id: 'footer.logo',
      src: data.logoUrl,
      maxWidth: 120,
      maxHeight: scale(size, 3.2),
      align: 'center',
    })
  }
  if (data.portalUrl) {
    children.push({
      kind: 'text',
      id: 'footer.portal',
      text: label(data, 'viewPortal', `View your portal: ${data.portalUrl}`).replace(
        '{url}',
        data.portalUrl
      ),
      style: { color: look.muted, fontSize: scale(size, 0.78), align: 'center' },
    })
  }
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
  const note = fields.includes('footer_note') ? data.fields.footer_note : ''
  if (data.branding) {
    // The workshop's own closing line stays on its own row, so the mark below
    // it reads as a signature on the sheet rather than a tail on their
    // sentence. This is the one place the branding is meant to be seen: the
    // header and totals carry it quietly, and three loud mentions on a
    // customer's invoice would read as an advert rather than a credit.
    if (note) {
      children.push({
        kind: 'text',
        text: note,
        style: { color: look.muted, fontSize: scale(size, 0.78), align: 'center' },
      })
    }
    children.push({
      kind: 'row',
      gap: 4,
      justify: 'center',
      align: 'center',
      children: [
        {
          node: {
            kind: 'text',
            text: label(data, 'poweredBy', 'Powered by'),
            style: { color: look.muted, fontSize: scale(size, 0.9) },
          },
        },
        { node: { kind: 'image', src: data.branding.logoDataUri, maxWidth: 22, maxHeight: 22 } },
        {
          node: {
            kind: 'text',
            text: 'Torqvoice',
            style: { color: theme.primary, fontSize: scale(size, 1.35), bold: true },
          },
        },
      ],
    })
  } else if (note) {
    children.push({
      kind: 'text',
      text: note,
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

/** The block for one section, or nothing when the section draws nothing. */
function blockFor(section: InvoiceSection, theme: DocumentTheme, data: DocumentData): Node | null {
  switch (section.id) {
    case 'header':
      return letterhead(section, theme, data)
    case 'slogan':
      return sloganBlock(section, theme, data)
    case 'customer':
    case 'vehicle':
    case 'service':
    case 'general':
      return panel(section, theme, data, sectionFields(section))
    case 'document_title':
      return documentTitle(section, theme, data)
    case 'items_table':
      return itemsTable(section, theme, data)
    case 'parts_table':
      return partsTable(section, theme, data)
    case 'labor_table':
      return laborTable(section, theme, data)
    case 'findings':
      return findingsBlock(section, theme, data)
    case 'totals':
      return totals(section, theme, data)
    case 'notes':
      return notesBlock(section, theme, data)
    case 'warranty':
      return warrantyBlock(section, theme, data)
    case 'bank_account':
      return paymentBlock(section, theme, data)
    case 'telegram_qr':
      return telegramBlock(section, theme, data)
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
  const contentWidth =
    595 - (framed ? FRAMED.padLeft + FRAMED.railWidth + theme.margin : theme.margin * 2)

  const blocks: Block[] = []
  const ordered = [...layout.sections].sort((a, b) => a.order - b.order)

  // Only the default placement rides the band; a letterhead somebody dragged
  // elsewhere leaves the band at its usual height.
  const headerSection = ordered.find((s) => s.id === 'header' && s.visible)
  const bandHeight =
    framed && headerSection && !anchors.header
      ? framedBandHeight(headerSection, theme, data)
      : FRAMED.bandHeight
  const framedTop = bandHeight + FRAMED_BAND_GAP

  const push = (section: InvoiceSection, placementOverride?: Placement, synthetic?: boolean) => {
    const content = blockFor(section, theme, data)
    if (!content) return

    const anchor = anchors[section.id]
    const placement: Placement =
      placementOverride ??
      (anchor
        ? { mode: 'anchored', anchor }
        : // A printed footer is held against the foot of the sheet, not left
          // to wherever the text above it happens to end.
          section.id === 'footer'
          ? { mode: 'pinned', edge: 'bottom' }
          : { mode: 'flow', order: section.order, column: section.column })

    const look = lookOf(section, theme)
    // The room a section keeps around itself. Zero everywhere means none, and
    // the block carries nothing.
    const s = section.style
    const margin =
      s?.marginTop || s?.marginRight || s?.marginBottom || s?.marginLeft
        ? {
            top: s.marginTop ?? 0,
            right: s.marginRight ?? 0,
            bottom: s.marginBottom ?? 0,
            left: s.marginLeft ?? 0,
          }
        : undefined
    blocks.push({
      id: section.id,
      label: section.id.replace(/_/g, ' '),
      synthetic,
      placement,
      margin,
      // Set on the block so every line inside inherits it.
      text: {
        color: look.text,
        fontFamily: look.fontFamily,
        fontSize: look.fontSize,
      },
      content,
    })
  }

  for (const section of ordered) {
    if (!section.visible) continue
    // A classic letterhead already prints the number and the dates, so the
    // title block would say them twice.
    if (section.id === 'document_title' && theme.classic) continue
    // The framed letterhead lives on the band the chrome paints, so unless a
    // hand placement says otherwise it is anchored there rather than flowed.
    if (section.id === 'header' && framed && !anchors.header) {
      push(section, {
        mode: 'anchored',
        anchor: {
          x: theme.frameSide === 'left' ? FRAMED.padLeft + FRAMED.railWidth : theme.margin,
          y: 14,
          width: contentWidth,
          page: 1,
        },
      })
      continue
    }
    push(section)
  }

  // The number, the date and the amount a customer quotes back must print
  // exactly once. When the layout has no title section of its own, the block
  // is borrowed and set directly under the header, which is where every
  // header used to print it.
  const titleSection = ordered.find((s) => s.id === 'document_title')
  if (titleSection && !titleSection.visible && !theme.classic) {
    const headerOrder = ordered.find((s) => s.id === 'header')?.order ?? 0
    push({ ...titleSection, visible: true }, { mode: 'flow', order: headerOrder + 0.5 }, true)
  }

  return {
    page: {
      width: 595,
      height: 842,
      margin: framed
        ? {
            top: framedTop,
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
          bandHeight,
          color: theme.primary,
          borderColor: theme.frameBorderColor,
          shadow: theme.frameShadow,
          radius: theme.frameRadius,
        }
      : undefined,
    blocks,
  }
}
