'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'
import {
  getDefaultInvoiceLayout,
  type InvoiceDocumentStyle,
  type InvoiceLayoutConfig,
  type InvoiceSection,
  type InvoiceSectionStyle,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  saveInvoiceLayoutConfig,
  saveQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import { SpecCanvas } from '../Render/SpecCanvas'
import { buildDocumentSpec, type DocumentData } from '../Spec/buildSpec'
import { SAMPLE_TABLES, fieldValues } from './sample'
import type { InvoiceAnchor } from '@/features/settings/Schema/invoiceLayoutSchema'
import { DesignerInspector, type DesignerFieldDef } from './DesignerInspector'
import type { DesignerTemplate, DesignerWorkshop, DocumentType, ResolvedTheme } from './types'

/** Blend two hex colors, used to derive the secondary tone the PDF derives. */
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

export function InvoiceDesigner({
  initialDocumentType,
  initialView,
  invoiceLayout,
  quoteLayout,
  invoiceTemplate,
  quoteTemplate,
  workshop,
  customFields,
}: {
  initialDocumentType: DocumentType
  initialView: 'gallery' | 'designer'
  invoiceLayout?: InvoiceLayoutConfig
  quoteLayout?: InvoiceLayoutConfig
  invoiceTemplate: DesignerTemplate
  quoteTemplate: DesignerTemplate
  workshop: DesignerWorkshop
  customFields: DesignerFieldDef[]
}) {
  const router = useRouter()
  const [view, setView] = useState<'gallery' | 'designer'>(initialView)
  const [docType, setDocType] = useState<DocumentType>(initialDocumentType)
  const [layouts, setLayouts] = useState<Record<DocumentType, InvoiceLayoutConfig>>({
    invoice: invoiceLayout ?? getDefaultInvoiceLayout(),
    quote: quoteLayout ?? getDefaultInvoiceLayout(),
  })
  const [templates, setTemplates] = useState<Record<DocumentType, DesignerTemplate>>({
    invoice: invoiceTemplate,
    quote: quoteTemplate,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rulers, setRulers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const layout = layouts[docType]
  const template = templates[docType]

  const setLayout = useCallback(
    (next: InvoiceLayoutConfig) => {
      setLayouts((prev) => ({ ...prev, [docType]: next }))
      setDirty(true)
    },
    [docType]
  )

  const setTemplate = useCallback(
    (patch: Partial<DesignerTemplate>) => {
      setTemplates((prev) => ({ ...prev, [docType]: { ...prev[docType], ...patch } }))
      setDirty(true)
    },
    [docType]
  )

  const theme: ResolvedTheme = useMemo(() => {
    const doc = layout.document ?? {}
    const text = template.textColor || '#111827'
    const background = template.backgroundColor || '#ffffff'
    return {
      primary: template.primaryColor,
      background,
      text,
      muted: template.textColor ? mix(text, background, 0.42) : '#6b7280',
      accent: doc.accentColor || template.primaryColor,
      companyText:
        template.companyTextColor ||
        (template.headerStyle === 'framed' || template.headerStyle === 'modern'
          ? '#ffffff'
          : template.primaryColor),
      fontFamily: doc.fontFamily || template.fontFamily,
      baseSize: doc.fontSize ?? BASE_FONT_SIZE,
      margin: doc.margin ?? 40,
      rowPadding: doc.rowPadding ?? 5,
      stripes: doc.stripes !== false,
      stripeColor: doc.stripeColor || '#f3f4f6',
    }
  }, [layout, template])

  /** What a workshop's own sheet says, with the sample standing in for a job. */
  const data: DocumentData = useMemo(
    () => ({
      fields: fieldValues(workshop),
      logoUrl: workshop.logoUrl || undefined,
      items: SAMPLE_TABLES.items.map((item) => ({
        n: String(item.n),
        qty: item.qty,
        unit: item.unit,
        desc: item.desc,
        sub: item.sku,
        price: item.price,
        total: item.total,
      })),
      findings: SAMPLE_TABLES.findings,
      meta: {
        title: docType === 'quote' ? 'QUOTE' : 'INVOICE',
        number: SAMPLE_TABLES.number,
        customerNumber: SAMPLE_TABLES.customerNumber,
        date: SAMPLE_TABLES.date,
        due: SAMPLE_TABLES.due,
      },
      totals: {
        subtotal: SAMPLE_TABLES.subtotal,
        taxLabel: 'Tax',
        tax: SAMPLE_TABLES.tax,
        total: SAMPLE_TABLES.total,
      },
      notes: SAMPLE_TABLES.notes,
      warranty: SAMPLE_TABLES.warranty,
      columnLabels: {
        pos: '#',
        qty: 'Qty',
        unit: 'Unit',
        description: 'Description',
        unitPrice: 'Unit price',
        total: 'Total',
      },
      sectionLabels: {
        customer: 'Bill to',
        vehicle: 'Vehicle',
        service: 'Service',
        bank_account: 'Payment information',
        general: 'Additional information',
        findings: 'Observations',
      },
    }),
    [workshop, docType]
  )

  const spec = useMemo(
    () =>
      buildDocumentSpec(
        layout,
        {
          primary: template.primaryColor,
          background: theme.background,
          text: theme.text,
          muted: theme.muted,
          accent: theme.accent,
          companyText: theme.companyText,
          fontFamily: theme.fontFamily,
          fontSize: theme.baseSize,
          margin: theme.margin,
          rowPadding: theme.rowPadding,
          stripes: theme.stripes,
          stripeColor: theme.stripeColor,
          headerStyle: template.headerStyle,
          frameSide: template.frameSide === 'right' ? 'right' : 'left',
          frameBorderColor: template.frameBorderColor || undefined,
          frameShadow: template.frameShadow !== 'false',
          logoSize: template.logoSize,
        },
        data
      ),
    [layout, template, theme, data]
  )

  /**
   * Dropped back into the flow, before the row at this index: it takes its
   * place among the others and everything below it moves down, which is what
   * putting something back is supposed to do.
   */
  const reorder = useCallback(
    (id: string, index: number) => {
      const anchors = { ...(layout.anchors ?? {}) }
      delete anchors[id]

      const ordered = [...layout.sections].sort((a, b) => a.order - b.order)
      const flowIds = ordered
        .filter((s) => s.visible && s.id !== id && !anchors[s.id] && s.id !== 'footer')
        .map((s) => s.id)
      const before = flowIds[index]

      const without = ordered.filter((s) => s.id !== id)
      const moved = ordered.find((s) => s.id === id)
      if (!moved) return
      const at = before ? without.findIndex((s) => s.id === before) : without.length
      without.splice(at === -1 ? without.length : at, 0, moved)

      setLayout({
        ...layout,
        anchors: Object.keys(anchors).length ? anchors : undefined,
        sections: without.map((s, i) => ({ ...s, order: i })),
      })
    },
    [layout, setLayout]
  )

  /** Where a dragged block came to rest, or nothing to put it back in the flow. */
  const setAnchor = useCallback(
    (id: string, anchor: InvoiceAnchor | undefined) => {
      const anchors = { ...(layout.anchors ?? {}) }
      if (anchor) anchors[id] = anchor
      else delete anchors[id]
      setLayout({ ...layout, anchors: Object.keys(anchors).length ? anchors : undefined })
    },
    [layout, setLayout]
  )

  const patchSection = useCallback(
    (id: string, patch: Partial<InvoiceSection>) => {
      setLayout({
        ...layout,
        sections: layout.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })
    },
    [layout, setLayout]
  )

  /** Back into the flow, in the column asked for. */
  const placeInFlow = useCallback(
    (id: string, column: 'left' | 'right' | undefined) => {
      const anchors = { ...(layout.anchors ?? {}) }
      delete anchors[id]
      setLayout({
        ...layout,
        anchors: Object.keys(anchors).length ? anchors : undefined,
        sections: layout.sections.map((s) => (s.id === id ? { ...s, column } : s)),
      })
    },
    [layout, setLayout]
  )

  const patchSectionStyle = useCallback(
    (id: string, style: InvoiceSectionStyle | undefined) => patchSection(id, { style }),
    [patchSection]
  )

  const patchDocument = useCallback(
    (patch: InvoiceDocumentStyle) => {
      const next = { ...(layout.document ?? {}), ...patch }
      const kept = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined && v !== '')
      )
      setLayout({ ...layout, document: Object.keys(kept).length ? kept : undefined })
    },
    [layout, setLayout]
  )

  /** Move one section to another's position, renumbering the whole order. */
  const moveSection = useCallback(
    (draggedId: string, overId: string) => {
      const ordered = [...layout.sections].sort((a, b) => a.order - b.order)
      const from = ordered.findIndex((s) => s.id === draggedId)
      const to = ordered.findIndex((s) => s.id === overId)
      if (from === -1 || to === -1) return
      const [moved] = ordered.splice(from, 1)
      ordered.splice(to, 0, moved)
      setLayout({ ...layout, sections: ordered.map((s, i) => ({ ...s, order: i })) })
    },
    [layout, setLayout]
  )

  const save = async () => {
    setSaving(true)
    try {
      const prefix = docType === 'invoice' ? 'invoice' : 'quote'
      await Promise.all([
        docType === 'invoice' ? saveInvoiceLayoutConfig(layout) : saveQuoteLayoutConfig(layout),
        setSettings({
          [`${prefix}.primaryColor`]: template.primaryColor,
          [`${prefix}.backgroundColor`]: template.backgroundColor,
          [`${prefix}.textColor`]: template.textColor,
          [`${prefix}.companyTextColor`]: template.companyTextColor,
          [`${prefix}.frameBorderColor`]: template.frameBorderColor,
          [`${prefix}.frameShadow`]: template.frameShadow,
          [`${prefix}.frameSide`]: template.frameSide,
          [`${prefix}.fontFamily`]: template.fontFamily,
          [`${prefix}.headerStyle`]: template.headerStyle,
          [`${prefix}.logoSize`]: String(template.logoSize),
        }),
      ])
      setDirty(false)
      toast.success('Saved')
    } catch {
      toast.error('Could not save')
    }
    setSaving(false)
  }

  if (view === 'gallery') {
    return (
      <div className="flex min-h-screen flex-col items-center overflow-y-auto px-8 py-14">
        <div className="w-full max-w-[1060px]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#2563eb]">
            Invoice designer
          </div>
          <h1 className="mb-1.5 mt-2 text-[30px] tracking-tight">Start from a template</h1>
          <p className="mb-8 text-[15px] text-[#5b6068]">
            Pick a starting point. You can change everything in the designer.
          </p>

          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {layoutPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setLayout(buildLayoutFromPreset(preset))
                  setView('designer')
                }}
                className="rounded-[10px] border border-[#e3e5e9] bg-white p-3.5 text-left transition-shadow hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,29,33,0.12)]"
              >
                <div className="overflow-hidden rounded-md border border-[#eceef1] bg-white">
                  <div
                    className="flex h-[26px] items-center justify-end px-2"
                    style={{ background: template.primaryColor }}
                  >
                    <div className="h-1.5 w-[52px] rounded-sm bg-white/85" />
                  </div>
                  <div className="flex flex-col gap-1.5 px-2 py-2.5">
                    <div className="h-1.5 w-3/5 rounded-sm bg-[#d7dade]" />
                    <div className="h-1.5 w-4/5 rounded-sm bg-[#e7e9ec]" />
                    <div className="h-1.5 w-[72%] rounded-sm bg-[#e7e9ec]" />
                    <div
                      className="mt-1 h-2.5 w-full rounded-sm"
                      style={{ background: `${template.primaryColor}33` }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 text-sm font-semibold capitalize">{preset.id}</div>
                <div className="text-xs leading-snug text-[#71767e]">
                  {preset.order.filter((id) => id !== 'header' && id !== 'footer').length} sections
                </div>
              </button>
            ))}
          </div>

          <div className="mt-7 flex justify-center gap-6">
            <button
              type="button"
              onClick={() => setView('designer')}
              className="text-sm font-medium text-[#2563eb]"
            >
              Continue with my current layout →
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings/templates')}
              className="text-sm text-[#71767e]"
            >
              Back to settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const rail = [...layout.sections].sort((a, b) => a.order - b.order)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex h-[52px] flex-none items-center gap-4 border-b border-[#e3e5e9] bg-white px-3.5">
        <button
          type="button"
          onClick={() => setView('gallery')}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          ◂ Templates
        </button>

        <div className="flex gap-0.5 rounded-lg bg-[#f0f1f4] p-[3px]">
          {(['invoice', 'quote'] as DocumentType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setDocType(type)
                setSelected(null)
              }}
              className="rounded-md px-3.5 py-1 text-[13px] capitalize"
              style={{
                background: docType === type ? '#fff' : 'transparent',
                fontWeight: docType === type ? 600 : 400,
                boxShadow: docType === type ? '0 1px 2px rgba(26,29,33,0.08)' : undefined,
              }}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setRulers(!rulers)}
          className="rounded-[7px] border border-[#e3e5e9] px-2.5 py-1.5 text-[13px]"
          style={{ background: rulers ? '#eef2ff' : '#fff', color: rulers ? '#2563eb' : undefined }}
        >
          ⊞ Rulers
        </button>

        <div className="flex items-center overflow-hidden rounded-[7px] border border-[#e3e5e9]">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="px-2.5 py-1.5 hover:bg-[#f4f5f7]"
          >
            −
          </button>
          <div className="w-12 border-x border-[#eceef1] py-1.5 text-center text-[12.5px] text-[#5b6068]">
            {Math.round(zoom * 100)}%
          </div>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
            className="px-2.5 py-1.5 hover:bg-[#f4f5f7]"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setLayout(getDefaultInvoiceLayout())
            setSelected(null)
          }}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-[7px] bg-[#2563eb] px-4 py-[7px] text-[13px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex w-[252px] flex-none flex-col border-r border-[#e3e5e9] bg-white">
          <div className="px-3.5 pb-2.5 pt-3.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[#8a8f97]">
            Sections
          </div>
          <div className="flex flex-1 flex-col gap-[3px] overflow-y-auto px-2 pb-3.5">
            {rail.map((section) => (
              <div
                key={section.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', section.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const dragged = e.dataTransfer.getData('text/plain')
                  if (dragged && dragged !== section.id) moveSection(dragged, section.id)
                }}
                onClick={() => setSelected(section.id)}
                className="flex cursor-pointer items-center gap-2 rounded-[7px] py-2 pl-1.5 pr-2 hover:bg-[#f4f5f7]"
                style={{
                  background: selected === section.id ? '#eef2ff' : undefined,
                  opacity: section.visible ? 1 : 0.45,
                }}
              >
                <span className="cursor-grab text-[13px] tracking-tighter text-[#b3b7bd]">⠿</span>
                <span className="flex-1 truncate text-[13.5px] capitalize">
                  {section.id.replace(/_/g, ' ')}
                </span>
                {section.column && (
                  <span className="rounded bg-[#eef2ff] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-[#2563eb]">
                    {section.column[0]}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    patchSection(section.id, { visible: !section.visible })
                  }}
                  className="px-0.5 text-[13px]"
                  style={{ color: section.visible ? '#5b6068' : '#c9ccd1' }}
                >
                  {section.visible ? '👁' : '⃠'}
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-[#eceef1] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#8a8f97]">
            Drag to reorder, click to edit.
            <br />
            Half-width sections pair up side by side.
          </div>
        </div>

        {selected && layout.anchors?.[selected] && (
          <button
            type="button"
            onClick={() => setAnchor(selected, undefined)}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-[#1a1d21] px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            Return {selected.replace(/_/g, ' ')} to the flow
          </button>
        )}
        <SpecCanvas
          spec={spec}
          selected={selected}
          onSelect={setSelected}
          onAnchor={setAnchor}
          onReorder={reorder}
          zoom={zoom}
          rulers={rulers}
        />

        <DesignerInspector
          layout={layout}
          template={template}
          customFields={customFields}
          selected={selected}
          onSelect={setSelected}
          onSection={patchSection}
          onPlaceInFlow={placeInFlow}
          onSectionStyle={patchSectionStyle}
          onDocument={patchDocument}
          onTemplate={setTemplate}
        />
      </div>
    </div>
  )
}
