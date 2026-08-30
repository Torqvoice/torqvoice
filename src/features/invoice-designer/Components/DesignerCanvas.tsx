'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  getBuiltinFieldsForSection,
  groupSectionsForRendering,
  type InvoiceLayoutConfig,
  type InvoiceSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { FRAMED, type FrameSide } from '@/features/vehicles/Components/invoice-pdf/frame'
import { fieldValues, SAMPLE_TABLES } from './sample'
import { fontStack, type DesignerWorkshop, type ResolvedTheme } from './types'

/**
 * The sheet, drawn in HTML.
 *
 * Deliberately not the PDF renderer: the point of this page is a sheet you can
 * click and drag, which react-pdf draws into an iframe and cannot offer. It
 * renders from the same layout the PDF renders from — the same sections, the
 * same field visibility, the same frame geometry — so what changes here changes
 * there. It is a schematic rather than a pixel proof, and the PDF is the last
 * word on how the paper comes out.
 */

/** A4 at 72dpi, the unit react-pdf lays the real page out in. */
const PAPER_W = 595
const PAPER_H = 842
/** The gap the PDF leaves between sections. */
const BLOCK_GAP = 14
const SHADOW_SHADES = ['rgba(0,0,0,0.13)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.03)']

/** Blend two colors, for deriving a section's secondary tone from its own ink. */
function mix(from: string, to: string, amount: number) {
  const parse = (hex: string) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [17, 24, 39]
  }
  const a = parse(from)
  const b = parse(to)
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount)
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`
}

/** One section's resolved appearance; every line inside it reads from this. */
interface SectionLook {
  text: string
  muted: string
  label: string
  fill?: string
  border?: string
  size?: number
  font?: string
}

function lookOf(section: InvoiceSection, theme: ResolvedTheme): SectionLook {
  const s = section.style
  const text = s?.textColor || theme.text
  return {
    text,
    muted: s?.textColor ? mix(text, theme.background, 0.42) : theme.muted,
    label: s?.labelColor || theme.accent,
    fill: s?.backgroundColor,
    border: s?.borderColor,
    size: s?.fontSize,
    font: s?.fontFamily,
  }
}

/**
 * The fields a section shows, in the order it shows them.
 *
 * A section with no field list of its own shows all of them, which is what the
 * PDF does when a layout predates the fields being configurable.
 */
function visibleFields(section: InvoiceSection): string[] {
  if (!section.fields) return getBuiltinFieldsForSection(section.id).map((f) => f.id)
  return section.fields.filter((f) => f.visible).map((f) => f.id)
}

function Panel({
  section,
  look,
  tag,
  lines,
  leadIndex = 0,
}: {
  section: InvoiceSection
  look: SectionLook
  tag: string
  lines: string[]
  /** Which line is the section's own headline, printed bold. */
  leadIndex?: number
}) {
  const boxed = section.boxed !== false
  const style: CSSProperties = {
    background: look.fill || (boxed ? '#f3f4f6' : undefined),
    border: boxed
      ? `1px solid ${look.border || '#e3e5e9'}`
      : look.border
        ? `1px solid ${look.border}`
        : undefined,
    padding: boxed || look.fill ? '10px 12px' : undefined,
    borderRadius: boxed ? 4 : undefined,
  }
  return (
    <div style={style}>
      <div
        style={{
          fontSize: '0.72em',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: look.label,
          marginBottom: 5,
        }}
      >
        {tag}
      </div>
      {lines.length === 0 ? (
        <div style={{ color: look.muted, fontStyle: 'italic' }}>No fields shown</div>
      ) : (
        lines.map((line, i) => (
          <div
            key={line}
            style={{
              fontWeight: i === leadIndex ? 700 : 400,
              color: i === leadIndex ? look.text : look.muted,
              lineHeight: 1.55,
            }}
          >
            {line}
          </div>
        ))
      )}
    </div>
  )
}

function SectionBody({
  section,
  look,
  theme,
  values,
  workshop,
  headerStyle,
  frameSide,
  companyText,
  logoSize,
}: {
  section: InvoiceSection
  look: SectionLook
  theme: ResolvedTheme
  values: Record<string, string>
  workshop: DesignerWorkshop
  headerStyle: string
  frameSide: FrameSide
  companyText: string
  logoSize: number
}) {
  const fields = visibleFields(section)
  const lines = (ids: string[]) => ids.map((id) => values[id]).filter((v): v is string => !!v)

  switch (section.id) {
    case 'header': {
      const framed = headerStyle === 'framed'
      const banded = framed || headerStyle === 'modern'
      const showLogo = fields.includes('logo') && !!workshop.logoUrl
      const showName = fields.includes('company_name')
      const strapline = lines(
        fields.filter((id) =>
          ['company_address', 'company_phone', 'company_email', 'company_org_number'].includes(id)
        )
      ).join('  ·  ')
      const slogan = fields.includes('company_slogan') ? values.company_slogan : ''

      const mark = showLogo ? (
        // A workshop upload rather than a static asset: next/image would need
        // a loader for it and buys nothing at this size.
        <img
          src={workshop.logoUrl}
          alt=""
          style={{
            maxHeight: (banded ? 46 : 40) * (logoSize / 100),
            maxWidth: 240,
            objectFit: 'contain',
          }}
        />
      ) : showName ? (
        <div style={{ fontSize: '1.8em', fontWeight: 800 }}>{values.company_name}</div>
      ) : null

      // On a framed sheet the band is drawn by the page, and this sits on it.
      return (
        <div>
          <div
            style={{
              height: framed ? FRAMED.bandHeight : undefined,
              background: banded && !framed ? theme.primary : undefined,
              color: banded ? companyText : look.label,
              padding: framed ? 0 : banded ? '18px 16px' : '0 0 10px',
              borderBottom: banded ? undefined : `2px solid ${theme.primary}`,
              display: 'flex',
              justifyContent: headerStyle === 'modern' ? 'center' : 'flex-end',
              alignItems: 'center',
            }}
          >
            {mark}
          </div>

          {(slogan || strapline) && (
            <div
              style={{
                textAlign: 'right',
                paddingTop: 8,
                paddingBottom: 8,
                borderBottom: framed ? `1px solid ${look.border || '#e5e7eb'}` : undefined,
              }}
            >
              {slogan && <div style={{ color: look.muted, fontSize: '1.05em' }}>{slogan}</div>}
              {strapline && (
                <div style={{ color: look.muted, fontSize: '0.9em', marginTop: slogan ? 3 : 0 }}>
                  {strapline}
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    case 'customer':
      return <Panel section={section} look={look} tag="Bill to" lines={lines(fields)} />
    case 'vehicle':
      return <Panel section={section} look={look} tag="Vehicle" lines={lines(fields)} />
    case 'service':
      return <Panel section={section} look={look} tag="Service" lines={lines(fields)} />
    case 'bank_account':
      return (
        <Panel
          section={section}
          look={look}
          tag="Payment information"
          lines={lines(fields)}
          leadIndex={-1}
        />
      )

    case 'document_title':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '2em', fontWeight: 800 }}>{SAMPLE_TABLES.title}</div>
          <div style={{ display: 'flex', border: `1px solid ${look.border || look.text}` }}>
            {[
              ['Invoice No.', SAMPLE_TABLES.number],
              ['Customer No.', SAMPLE_TABLES.customerNumber],
              ['Date', SAMPLE_TABLES.date],
              ['Due', SAMPLE_TABLES.due],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: '4px 10px',
                  textAlign: 'center',
                  borderRight: `1px solid ${look.border || '#c9ccd1'}`,
                }}
              >
                <div style={{ fontSize: '0.62em', color: look.muted }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: '0.85em' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )

    case 'items_table':
    case 'parts_table':
    case 'labor_table':
      return (
        <div>
          <div
            style={{
              display: 'flex',
              background: look.fill || look.text,
              color: look.fill ? look.label : theme.background,
              fontSize: '0.78em',
              fontWeight: 600,
              padding: '7px 10px',
            }}
          >
            <span style={{ width: 22 }}>#</span>
            <span style={{ width: 48, textAlign: 'right' }}>Qty</span>
            <span style={{ width: 40, paddingLeft: 8 }}>Unit</span>
            <span style={{ flex: 1, paddingLeft: 10 }}>Description</span>
            <span style={{ width: 74, textAlign: 'right' }}>Unit price</span>
            <span style={{ width: 74, textAlign: 'right' }}>Total</span>
          </div>
          {SAMPLE_TABLES.items.map((item, i) => (
            <div
              key={item.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: `${theme.rowPadding}px 10px`,
                background: theme.stripes && i % 2 === 1 ? theme.stripeColor : undefined,
                fontSize: '0.85em',
                borderBottom: `1px solid ${look.border || '#eceef1'}`,
              }}
            >
              <span style={{ width: 22, color: look.muted }}>{item.n}</span>
              <span style={{ width: 48, textAlign: 'right', fontWeight: 600 }}>{item.qty}</span>
              <span style={{ width: 40, paddingLeft: 8, color: look.muted }}>{item.unit}</span>
              <span style={{ flex: 1, paddingLeft: 10 }}>
                <span style={{ fontWeight: 600 }}>{item.desc}</span>
                {item.sku && (
                  <span style={{ display: 'block', color: look.muted, fontSize: '0.85em' }}>
                    {item.sku}
                  </span>
                )}
              </span>
              <span style={{ width: 74, textAlign: 'right' }}>{item.price}</span>
              <span style={{ width: 74, textAlign: 'right', fontWeight: 700 }}>{item.total}</span>
            </div>
          ))}
        </div>
      )

    case 'findings':
      return (
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05em', color: look.label }}>Observations</div>
          {SAMPLE_TABLES.findings.map((f) => (
            <div
              key={f.description}
              style={{
                display: 'flex',
                gap: 10,
                fontSize: '0.85em',
                padding: '6px 0',
                borderBottom: `1px solid ${look.border || '#eceef1'}`,
              }}
            >
              <span style={{ width: 80, fontWeight: 700, color: f.color }}>{f.severity}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{f.description}</span>
              <span style={{ flex: 1, color: look.muted }}>{f.notes}</span>
            </div>
          ))}
        </div>
      )

    case 'totals':
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: '46%',
              border: `1px solid ${look.border || look.text}`,
              background: look.fill,
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.9em',
              }}
            >
              <span style={{ color: look.muted }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{SAMPLE_TABLES.subtotal}</span>
            </div>
            <div
              style={{
                padding: '0 12px 7px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.9em',
              }}
            >
              <span style={{ color: look.muted }}>Tax</span>
              <span style={{ fontWeight: 600 }}>{SAMPLE_TABLES.tax}</span>
            </div>
            <div
              style={{
                padding: '9px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: `1px solid ${theme.accent}`,
              }}
            >
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 800, color: theme.accent }}>{SAMPLE_TABLES.total}</span>
            </div>
          </div>
        </div>
      )

    case 'notes':
    case 'warranty':
    case 'general':
      return (
        <div
          style={{
            background: look.fill || '#f3f4f6',
            border: look.border ? `1px solid ${look.border}` : undefined,
            padding: '10px 12px',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: '0.72em',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: look.label,
            }}
          >
            {section.id === 'notes'
              ? 'Notes'
              : section.id === 'warranty'
                ? 'Warranty'
                : 'Additional information'}
          </div>
          <div style={{ color: look.muted, fontSize: '0.9em', lineHeight: 1.6 }}>
            {section.id === 'warranty' ? SAMPLE_TABLES.warranty : SAMPLE_TABLES.notes}
          </div>
        </div>
      )

    case 'footer': {
      // Three columns, the way printed stationery groups them: who the shop is,
      // how to reach it, how to pay it. Empty columns are dropped.
      const columns = [
        ['company_name', 'company_address'],
        ['company_phone', 'company_email'],
        ['bank_account', 'company_org_number'],
      ]
        .map((column) => lines(column.filter((id) => fields.includes(id))))
        .filter((column) => column.length > 0)

      return (
        <div style={{ borderTop: `2px solid ${look.border || theme.accent}`, paddingTop: 8 }}>
          {columns.length > 0 && (
            <div style={{ display: 'flex', gap: 16, fontSize: '0.72em', color: look.muted }}>
              {columns.map((column) => (
                <div key={column[0]} style={{ flex: 1 }}>
                  {column.map((line, i) => (
                    <div key={line} style={{ fontWeight: i === 0 ? 700 : 400 }}>
                      {line}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {fields.includes('footer_note') && (
            <div
              style={{ textAlign: 'center', color: look.muted, fontSize: '0.78em', marginTop: 6 }}
            >
              {values.footer_note}
            </div>
          )}
        </div>
      )
    }

    default:
      return <div style={{ color: look.muted, fontSize: '0.85em' }}>{section.id}</div>
  }
}

export function DesignerCanvas({
  layout,
  theme,
  workshop,
  headerStyle,
  frameSide,
  companyText,
  logoSize,
  frameBorderColor,
  frameShadow,
  selected,
  onSelect,
  onMove,
  rulers,
  zoom,
}: {
  layout: InvoiceLayoutConfig
  theme: ResolvedTheme
  workshop: DesignerWorkshop
  headerStyle: string
  frameSide: FrameSide
  companyText: string
  logoSize: number
  frameBorderColor?: string
  frameShadow: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (draggedId: string, overId: string) => void
  rulers: boolean
  zoom: number
}) {
  const byId = new Map(layout.sections.map((s) => [s.id, s]))
  const groups = groupSectionsForRendering(layout.sections)
  const framed = headerStyle === 'framed'
  const values = fieldValues(workshop)
  const visible = layout.sections.filter((s) => s.visible)
  const headerSelected = selected === 'header'

  // The sheet is A4 and stays A4. Base size and margins change how much fits on
  // it, never how big it is, so blocks are measured once laid out and dealt
  // into pages that hold them.
  const measureRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[]>([])

  const railEdge = frameSide === 'right' ? 'right' : 'left'
  const inset = {
    top: framed ? FRAMED.padTop : theme.margin,
    left: framed && railEdge === 'left' ? FRAMED.padLeft + FRAMED.railWidth : theme.margin,
    right: framed && railEdge === 'right' ? FRAMED.padLeft + FRAMED.railWidth : theme.margin,
    bottom: theme.margin,
  }

  useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    const next = Array.from(node.children).map((child) => (child as HTMLElement).offsetHeight)
    setHeights((prev) =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next
    )
  })

  const pages: number[][] = []
  if (groups.length > 0) {
    let page: number[] = []
    let used = 0
    let budget = PAPER_H - inset.top - inset.bottom
    groups.forEach((_, i) => {
      const height = (heights[i] ?? 0) + (page.length ? BLOCK_GAP : 0)
      if (page.length && used + height > budget) {
        pages.push(page)
        page = []
        used = 0
        budget = PAPER_H - theme.margin - inset.bottom
      }
      page.push(i)
      used += height
    })
    pages.push(page)
  }

  const block = (id: string, measuring = false): ReactNode => {
    const section = byId.get(id)
    if (!section) return null
    const look = lookOf(section, theme)
    const isSelected = !measuring && selected === id
    // The framed letterhead sits on chrome the page draws; its own outline is
    // drawn over that chrome instead, so it does not get one here.
    const onFrame = framed && id === 'header'

    return (
      <div
        key={id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dragged = e.dataTransfer.getData('text/plain')
          if (dragged && dragged !== id) onMove(dragged, id)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(id)
        }}
        style={{
          position: 'relative',
          zIndex: 2,
          cursor: 'pointer',
          outline: isSelected && !onFrame ? '2px solid #2563eb' : undefined,
          outlineOffset: 3,
          // Set once here so every line inside the section inherits it.
          color: look.text,
          fontFamily: look.font ? fontStack(look.font) : undefined,
          fontSize: look.size ? `${look.size}px` : undefined,
          ...(onFrame
            ? {
                marginTop: -FRAMED.padTop,
                marginLeft: -inset.left,
                marginRight: -inset.right,
                paddingLeft: railEdge === 'left' ? FRAMED.railWidth + 26 : 26,
                paddingRight: railEdge === 'right' ? FRAMED.railWidth + 26 : 26,
              }
            : {}),
        }}
      >
        {isSelected && !onFrame && (
          <div
            style={{
              position: 'absolute',
              top: -20,
              left: -3,
              background: '#2563eb',
              color: '#fff',
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: '4px 4px 0 0',
              zIndex: 5,
            }}
          >
            {section.id.replace(/_/g, ' ')}
          </div>
        )}
        <SectionBody
          section={section}
          look={look}
          theme={theme}
          values={values}
          workshop={workshop}
          headerStyle={headerStyle}
          frameSide={railEdge}
          companyText={companyText}
          logoSize={logoSize}
        />
      </div>
    )
  }

  const groupBlock = (group: (typeof groups)[number], key: number, measuring = false) => {
    if (group.type === 'full-width') return block(group.sectionId, measuring)
    return (
      <div key={`col-${key}`} style={{ display: 'flex', gap: BLOCK_GAP, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: BLOCK_GAP }}>
          {group.left.map((id) => block(id, measuring))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: BLOCK_GAP }}>
          {group.right.map((id) => block(id, measuring))}
        </div>
      </div>
    )
  }

  /**
   * The band and the rail are one shape, drawn by the page rather than by the
   * header, so they cannot come apart or leave a seam of paper between them.
   */
  const frameChrome = (pageNumber: number) => (
    <>
      {pageNumber === 1 && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onSelect('header')
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: FRAMED.bandHeight,
            background: theme.primary,
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      )}
      <div
        onClick={(e) => {
          // The rail is the sheet's edge, not a section: it asks about the
          // document, the way clicking the paper does.
          e.stopPropagation()
          onSelect(null)
        }}
        style={{
          position: 'absolute',
          [railEdge]: 0,
          top: 0,
          bottom: 0,
          width: FRAMED.railWidth,
          background: theme.primary,
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          [railEdge]: FRAMED.railWidth,
          top: pageNumber === 1 ? FRAMED.bandHeight : 0,
          bottom: 0,
          display: 'flex',
          flexDirection: railEdge === 'right' ? 'row-reverse' : 'row',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {frameBorderColor && <div style={{ width: 1, background: frameBorderColor }} />}
        {frameShadow &&
          SHADOW_SHADES.map((shade) => (
            <div key={shade} style={{ width: 1.5, background: shade }} />
          ))}
      </div>
      {pageNumber === 1 && (
        <div
          style={{
            position: 'absolute',
            left: railEdge === 'left' ? FRAMED.railWidth : 0,
            right: railEdge === 'right' ? FRAMED.railWidth : 0,
            top: FRAMED.bandHeight,
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {frameBorderColor && <div style={{ height: 1, background: frameBorderColor }} />}
          {frameShadow &&
            SHADOW_SHADES.map((shade) => (
              <div key={shade} style={{ height: 1.5, background: shade }} />
            ))}
        </div>
      )}
      {/* The letterhead is the band and the rail together, and it appears on
          the first sheet only. Outlining the pair says what selecting the
          header actually covers; the earlier version outlined the whole of
          every page after the first, which said nothing at all. */}
      {headerSelected && pageNumber === 1 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: FRAMED.bandHeight,
              outline: '2px solid #2563eb',
              outlineOffset: -2,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              [railEdge]: 0,
              top: FRAMED.bandHeight,
              bottom: 0,
              width: FRAMED.railWidth,
              outline: '2px solid #2563eb',
              outlineOffset: -2,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
        </>
      )}
    </>
  )

  const sheet = (indices: number[], pageNumber: number) => (
    <div
      key={pageNumber}
      style={{
        width: PAPER_W,
        height: PAPER_H,
        background: theme.background,
        boxShadow: '0 12px 32px rgba(26,29,33,0.18)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: fontStack(theme.fontFamily),
        color: theme.text,
        fontSize: theme.baseSize,
        paddingTop: pageNumber === 1 ? inset.top : theme.margin,
        paddingLeft: inset.left,
        paddingRight: inset.right,
        paddingBottom: inset.bottom,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: BLOCK_GAP,
      }}
    >
      {framed && frameChrome(pageNumber)}

      {rulers && (
        <div
          style={{
            position: 'absolute',
            top: pageNumber === 1 ? inset.top : theme.margin,
            left: inset.left,
            right: inset.right,
            bottom: inset.bottom,
            border: '1px dashed rgba(37,99,235,0.35)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}

      {indices.map((i) => groupBlock(groups[i], i))}
    </div>
  )

  return (
    <div
      onClick={() => onSelect(null)}
      className="flex flex-1 flex-col items-center overflow-auto bg-[#e4e7eb] px-10 pb-16 pt-9"
    >
      {rulers && (
        <div
          style={{
            width: PAPER_W * zoom,
            height: 16,
            flex: 'none',
            background:
              'repeating-linear-gradient(90deg,#aeb3ba 0 1px,transparent 1px 10px), repeating-linear-gradient(90deg,#8a8f97 0 1px,transparent 1px 50px)',
            borderBottom: '1px solid #c9ccd1',
            opacity: 0.7,
          }}
        />
      )}

      {/* Laid out but not shown: blocks have to be measured at the width they
          will print at before they can be dealt into pages. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: -99999,
          width: PAPER_W - inset.left - inset.right,
          fontFamily: fontStack(theme.fontFamily),
          fontSize: theme.baseSize,
          display: 'flex',
          flexDirection: 'column',
          gap: BLOCK_GAP,
        }}
      >
        {groups.map((group, i) => (
          <div key={`m-${group.type === 'full-width' ? group.sectionId : group.left[0]}`}>
            {groupBlock(group, i, true)}
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            width: PAPER_W * zoom,
            height: PAPER_H * zoom,
            background: theme.background,
            boxShadow: '0 12px 32px rgba(26,29,33,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#b3b7bd',
            fontSize: 14,
          }}
        >
          All sections are hidden — turn some on in the left panel.
        </div>
      ) : (
        <div style={{ width: PAPER_W * zoom }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pages.map((indices, i) => (
                <div
                  key={indices[0] ?? i}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {sheet(indices, i + 1)}
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#8a8f97' }}>
                    Page {i + 1} of {pages.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
