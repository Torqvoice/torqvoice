'use client'

import type { CSSProperties } from 'react'
import {
  groupSectionsForRendering,
  type InvoiceLayoutConfig,
  type InvoiceSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { fontStack, type DesignerWorkshop, type ResolvedTheme } from './types'

/**
 * The sheet, drawn in HTML.
 *
 * Deliberately not the PDF renderer: the point here is a page you can click and
 * drag, which react-pdf renders into an iframe and cannot offer. It is a
 * schematic of the same layout config the PDF reads, so what moves here moves
 * there; it is not a pixel-exact proof, and the PDF stays the last word.
 */
export interface SampleData {
  customer: { name: string; lines: string[] }
  vehicle: { name: string; lines: string[] }
  service: { name: string; lines: string[] }
  items: {
    n: number
    qty: string
    unit: string
    desc: string
    sku?: string
    price: string
    total: string
  }[]
  findings: { severity: string; color: string; description: string; notes: string }[]
  subtotal: string
  tax: string
  total: string
  number: string
  date: string
  due: string
  customerNumber: string
  notes: string
}

function sectionStyleOf(section: InvoiceSection | undefined, theme: ResolvedTheme) {
  const s = section?.style
  return {
    text: s?.textColor || theme.text,
    label: s?.labelColor || theme.accent,
    fill: s?.backgroundColor,
    border: s?.borderColor,
    size: s?.fontSize,
    font: s?.fontFamily,
  }
}

function Panel({
  section,
  theme,
  tag,
  title,
  lines,
}: {
  section: InvoiceSection
  theme: ResolvedTheme
  tag: string
  title: string
  lines: string[]
}) {
  const st = sectionStyleOf(section, theme)
  const boxed = section.boxed !== false
  const style: CSSProperties = {
    color: st.text,
    fontFamily: st.font ? fontStack(st.font) : undefined,
    fontSize: st.size ? `${st.size}px` : undefined,
    background: st.fill || (boxed ? '#f3f4f6' : undefined),
    border: boxed
      ? `1px solid ${st.border || '#e3e5e9'}`
      : st.border
        ? `1px solid ${st.border}`
        : undefined,
    padding: boxed || st.fill ? '10px 12px' : undefined,
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
          color: st.label,
          marginBottom: 5,
        }}
      >
        {tag}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
      {lines.map((line) => (
        <div key={line} style={{ color: theme.muted, lineHeight: 1.55 }}>
          {line}
        </div>
      ))}
    </div>
  )
}

function SectionBody({
  section,
  theme,
  sample,
  workshop,
  headerStyle,
  companyText,
}: {
  section: InvoiceSection
  theme: ResolvedTheme
  sample: SampleData
  workshop: DesignerWorkshop
  headerStyle: string
  companyText: string
}) {
  const st = sectionStyleOf(section, theme)

  switch (section.id) {
    case 'header': {
      const framed = headerStyle === 'framed'
      const banded = framed || headerStyle === 'modern'
      return (
        <div style={{ fontFamily: st.font ? fontStack(st.font) : undefined }}>
          <div
            style={{
              background: banded ? theme.primary : undefined,
              color: banded ? companyText : theme.primary,
              padding: banded ? '18px 16px' : '0 0 10px',
              borderBottom: banded ? undefined : `2px solid ${theme.primary}`,
              display: 'flex',
              justifyContent: headerStyle === 'modern' ? 'center' : 'flex-end',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: '1.8em', fontWeight: 800 }}>
              {workshop.name || 'Your Workshop'}
            </div>
          </div>
          {workshop.slogan && (
            <div style={{ textAlign: 'right', color: theme.muted, paddingTop: 6 }}>
              {workshop.slogan}
            </div>
          )}
        </div>
      )
    }

    case 'customer':
      return (
        <Panel
          section={section}
          theme={theme}
          tag="Bill to"
          title={sample.customer.name}
          lines={sample.customer.lines}
        />
      )
    case 'vehicle':
      return (
        <Panel
          section={section}
          theme={theme}
          tag="Vehicle"
          title={sample.vehicle.name}
          lines={sample.vehicle.lines}
        />
      )
    case 'service':
      return (
        <Panel
          section={section}
          theme={theme}
          tag="Service"
          title={sample.service.name}
          lines={sample.service.lines}
        />
      )

    case 'document_title':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '2em', fontWeight: 800, color: st.text }}>INVOICE</div>
          <div style={{ display: 'flex', border: `1px solid ${st.border || theme.text}` }}>
            {[
              ['Invoice No.', sample.number],
              ['Customer No.', sample.customerNumber],
              ['Date', sample.date],
              ['Due', sample.due],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: '4px 10px',
                  textAlign: 'center',
                  borderRight: `1px solid ${st.border || '#c9ccd1'}`,
                }}
              >
                <div style={{ fontSize: '0.62em', color: theme.muted }}>{label}</div>
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
        <div style={{ fontFamily: st.font ? fontStack(st.font) : undefined }}>
          <div
            style={{
              display: 'flex',
              background: st.fill || theme.text,
              color: st.label || theme.background || '#fff',
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
          {sample.items.map((item, i) => (
            <div
              key={item.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: `${theme.rowPadding}px 10px`,
                background: theme.stripes && i % 2 === 1 ? theme.stripeColor : undefined,
                fontSize: '0.85em',
                borderBottom: `1px solid ${st.border || '#eceef1'}`,
              }}
            >
              <span style={{ width: 22, color: theme.muted }}>{item.n}</span>
              <span style={{ width: 48, textAlign: 'right', fontWeight: 600 }}>{item.qty}</span>
              <span style={{ width: 40, paddingLeft: 8, color: theme.muted }}>{item.unit}</span>
              <span style={{ flex: 1, paddingLeft: 10 }}>
                <span style={{ fontWeight: 600 }}>{item.desc}</span>
                {item.sku && (
                  <span style={{ display: 'block', color: theme.muted, fontSize: '0.85em' }}>
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
          <div style={{ fontWeight: 700, fontSize: '1.05em', color: st.text }}>Observations</div>
          {sample.findings.map((f) => (
            <div
              key={f.description}
              style={{
                display: 'flex',
                gap: 10,
                fontSize: '0.85em',
                padding: '6px 0',
                borderBottom: '1px solid #eceef1',
              }}
            >
              <span style={{ width: 80, fontWeight: 700, color: f.color }}>{f.severity}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{f.description}</span>
              <span style={{ flex: 1, color: theme.muted }}>{f.notes}</span>
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
              border: `1px solid ${st.border || theme.text}`,
              background: st.fill,
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
              <span style={{ color: theme.muted }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{sample.subtotal}</span>
            </div>
            <div
              style={{
                padding: '0 12px 7px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.9em',
              }}
            >
              <span style={{ color: theme.muted }}>Tax</span>
              <span style={{ fontWeight: 600 }}>{sample.tax}</span>
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
              <span style={{ fontWeight: 800, color: theme.accent }}>{sample.total}</span>
            </div>
          </div>
        </div>
      )

    case 'notes':
    case 'warranty':
    case 'bank_account':
    case 'general':
      return (
        <div
          style={{
            background: st.fill || '#f3f4f6',
            border: st.border ? `1px solid ${st.border}` : undefined,
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
              color: st.label,
            }}
          >
            {section.id === 'notes'
              ? 'Notes'
              : section.id === 'warranty'
                ? 'Warranty'
                : section.id === 'bank_account'
                  ? 'Payment information'
                  : 'Additional information'}
          </div>
          <div style={{ color: theme.muted, fontSize: '0.9em', lineHeight: 1.6 }}>
            {sample.notes}
          </div>
        </div>
      )

    case 'footer':
      return (
        <div
          style={{
            borderTop: `2px solid ${theme.accent}`,
            paddingTop: 8,
            textAlign: 'center',
            color: theme.muted,
            fontSize: '0.78em',
            lineHeight: 1.6,
          }}
        >
          {workshop.name} · {workshop.address} · {workshop.phone} · {workshop.email}
        </div>
      )

    default:
      return <div style={{ color: theme.muted, fontSize: '0.85em' }}>{section.id}</div>
  }
}

export function DesignerCanvas({
  layout,
  theme,
  sample,
  workshop,
  headerStyle,
  companyText,
  selected,
  onSelect,
  onMove,
  rulers,
  zoom,
}: {
  layout: InvoiceLayoutConfig
  theme: ResolvedTheme
  sample: SampleData
  workshop: DesignerWorkshop
  headerStyle: string
  companyText: string
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (draggedId: string, overId: string) => void
  rulers: boolean
  zoom: number
}) {
  const byId = new Map(layout.sections.map((s) => [s.id, s]))
  const groups = groupSectionsForRendering(layout.sections)

  const block = (id: string) => {
    const section = byId.get(id)
    if (!section) return null
    const isSelected = selected === id
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
          cursor: 'pointer',
          outline: isSelected ? '2px solid #2563eb' : undefined,
          outlineOffset: 3,
        }}
      >
        {isSelected && (
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
            }}
          >
            {section.id.replace(/_/g, ' ')}
          </div>
        )}
        <SectionBody
          section={section}
          theme={theme}
          sample={sample}
          workshop={workshop}
          headerStyle={headerStyle}
          companyText={companyText}
        />
      </div>
    )
  }

  const paperWidth = 595
  const visible = layout.sections.filter((s) => s.visible)

  return (
    <div
      onClick={() => onSelect(null)}
      className="flex flex-1 flex-col items-center overflow-auto bg-[#e4e7eb] px-10 pb-16 pt-9"
    >
      {rulers && (
        <div
          style={{
            width: paperWidth * zoom,
            height: 16,
            flex: 'none',
            background:
              'repeating-linear-gradient(90deg,#aeb3ba 0 1px,transparent 1px 10px), repeating-linear-gradient(90deg,#8a8f97 0 1px,transparent 1px 50px)',
            borderBottom: '1px solid #c9ccd1',
            opacity: 0.7,
          }}
        />
      )}
      <div style={{ width: paperWidth * zoom }}>
        <div
          style={{
            width: paperWidth,
            minHeight: 842,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            background: theme.background,
            boxShadow: '0 12px 32px rgba(26,29,33,0.18)',
            position: 'relative',
            fontFamily: fontStack(theme.fontFamily),
            color: theme.text,
            fontSize: theme.baseSize,
            padding: theme.margin,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {rulers && (
            <div
              style={{
                position: 'absolute',
                inset: theme.margin,
                border: '1px dashed rgba(37,99,235,0.35)',
                pointerEvents: 'none',
              }}
            />
          )}

          {visible.length === 0 ? (
            <div style={{ color: '#b3b7bd', textAlign: 'center', padding: '60px 0', fontSize: 14 }}>
              All sections are hidden — turn some on in the left panel.
            </div>
          ) : (
            groups.map((group) =>
              group.type === 'full-width' ? (
                block(group.sectionId)
              ) : (
                <div
                  key={`col-${group.left[0] ?? group.right[0]}`}
                  style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}
                >
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {group.left.map(block)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {group.right.map(block)}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  )
}
