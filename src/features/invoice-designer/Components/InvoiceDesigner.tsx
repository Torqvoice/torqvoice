'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useMessages, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-dialog'
import { DocsLink } from '@/components/docs-link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'
import {
  COLUMN_ELIGIBLE_SECTIONS,
  DESIGNER_LAYOUT_VERSION,
  getDefaultInvoiceLayout,
  materializeHiddenSection,
  mergeWithDefaults,
  toCustomFieldId,
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
import { SpecThumbnail } from '../Render/SpecThumbnail'
import { buildDocumentSpec, frameShadowWidth, type DocumentData } from '../Spec/buildSpec'
import { fieldValues, fillTemplate, sampleTables, type PrintLabels } from './sample'
import type { InvoiceAnchor } from '@/features/settings/Schema/invoiceLayoutSchema'
import { DesignerInspector, type DesignerFieldDef } from './DesignerInspector'
import type { DesignerTemplate, DesignerWorkshop, DocumentType, SavedDesign } from './types'

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

/** The template fields a preset carries, over whatever is already set. */
function presetTemplatePatch(preset: (typeof layoutPresets)[number]) {
  return {
    primaryColor: preset.template.primaryColor,
    headerStyle: preset.template.headerStyle,
    fontFamily: preset.template.fontFamily,
    frameSide: preset.template.frameSide ?? 'left',
    backgroundColor: preset.template.backgroundColor ?? '',
    textColor: preset.template.textColor ?? '',
  }
}

/**
 * An id for a saved design. crypto.randomUUID only exists in secure contexts,
 * and a dev server reached over a LAN address is not one, so it gets a plain
 * random fallback rather than a crash.
 */
function designId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** The theme a designer template and layout resolve to, for the generator. */
function themeOf(template: DesignerTemplate, layout: InvoiceLayoutConfig) {
  const doc = layout.document ?? {}
  const text = template.textColor || '#111827'
  const background = template.backgroundColor || '#ffffff'
  const banded = template.headerStyle === 'framed' || template.headerStyle === 'modern'
  return {
    primary: template.primaryColor,
    background,
    text,
    muted: template.textColor ? mix(text, background, 0.42) : '#6b7280',
    accent: doc.accentColor || template.primaryColor,
    companyText: template.companyTextColor || (banded ? '#ffffff' : template.primaryColor),
    fontFamily: doc.fontFamily || template.fontFamily,
    fontSize: doc.fontSize ?? BASE_FONT_SIZE,
    margin: doc.margin ?? 40,
    rowPadding: doc.rowPadding ?? 5,
    stripes: doc.stripes !== false,
    stripeColor: doc.stripeColor || mix(background, text, 0.045),
    headerStyle: template.headerStyle,
    frameSide: template.frameSide === 'right' ? ('right' as const) : ('left' as const),
    frameBorderColor: template.frameBorderColor || undefined,
    frameShadow: frameShadowWidth(template.frameShadow),
    frameRadius: template.frameRadius,
    logoSize: template.logoSize,
  }
}

export function InvoiceDesigner({
  initialDocumentType,
  initialView,
  invoiceLayout,
  quoteLayout,
  invoiceTemplate,
  quoteTemplate,
  initialSavedDesigns = [],
  initialPresetId,
  initialActiveDesigns,
  workshop: companyWorkshop,
  customFields,
}: {
  initialDocumentType: DocumentType
  initialView: 'gallery' | 'designer'
  invoiceLayout?: InvoiceLayoutConfig
  quoteLayout?: InvoiceLayoutConfig
  invoiceTemplate: DesignerTemplate
  quoteTemplate: DesignerTemplate
  initialSavedDesigns?: SavedDesign[]
  /** A preset to arrive with already applied, from settings' starting points. */
  initialPresetId?: string
  /** What each document's design is based on: "preset:<id>" or "design:<id>". */
  initialActiveDesigns?: Record<DocumentType, string>
  workshop: DesignerWorkshop
  customFields: DesignerFieldDef[]
}) {
  const router = useRouter()
  const t = useTranslations('settings.designer')
  const tSection = useTranslations('settings.layoutEditor.sections')
  const tPreset = useTranslations('settings.layoutEditor.presets')
  const messages = useMessages() as {
    pdf?: Record<string, Record<string, string>>
  }
  // Arriving with ?preset= means a starting point was picked in settings:
  // land in the designer with it applied, as unsaved work.
  const initialPreset = initialPresetId
    ? layoutPresets.find((p) => p.id === initialPresetId)
    : undefined
  const [view, setView] = useState<'gallery' | 'designer'>(initialPreset ? 'designer' : initialView)
  const [docType, setDocType] = useState<DocumentType>(initialDocumentType)
  const [layouts, setLayouts] = useState<Record<DocumentType, InvoiceLayoutConfig>>(() => {
    const base = {
      invoice: invoiceLayout ?? getDefaultInvoiceLayout(),
      quote: quoteLayout ?? getDefaultInvoiceLayout(),
    }
    if (initialPreset) base[initialDocumentType] = buildLayoutFromPreset(initialPreset)
    return base
  })
  const [templates, setTemplates] = useState<Record<DocumentType, DesignerTemplate>>(() => {
    const base = { invoice: invoiceTemplate, quote: quoteTemplate }
    if (initialPreset) {
      base[initialDocumentType] = {
        ...base[initialDocumentType],
        ...presetTemplatePatch(initialPreset),
      }
    }
    return base
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rulers, setRulers] = useState(false)
  const [saving, setSaving] = useState(false)
  // Per document, because Save only writes the sheet being looked at: one
  // shared flag let saving the quote clear the invoice's unsaved edits.
  const [dirty, setDirty] = useState<Record<DocumentType, boolean>>({
    invoice: !!initialPreset && initialDocumentType === 'invoice',
    quote: !!initialPreset && initialDocumentType === 'quote',
  })
  // The preset in the URL is a one-shot instruction, consumed above. Left in
  // the address bar it would re-apply itself on every refresh, overriding
  // whatever the user picked since, so it is stripped once acted on.
  useEffect(() => {
    if (!initialPresetId) return
    const url = new URL(window.location.href)
    url.searchParams.delete('preset')
    url.searchParams.set('view', 'designer')
    window.history.replaceState(null, '', url.toString())
  }, [initialPresetId])

  /** What the sheet being edited is based on, per document, for the gallery. */
  const [activeDesigns, setActiveDesigns] = useState<Record<DocumentType, string>>(() => {
    const base = {
      invoice: initialActiveDesigns?.invoice ?? '',
      quote: initialActiveDesigns?.quote ?? '',
    }
    if (initialPreset) base[initialDocumentType] = `preset:${initialPreset.id}`
    return base
  })
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>(initialSavedDesigns)
  /** Open state and draft name for the save-design dialog. */
  const [namingDesign, setNamingDesign] = useState(false)
  const [designName, setDesignName] = useState('')
  const confirm = useConfirm()

  const layout = layouts[docType]
  const template = templates[docType]
  // Blocks the canvas is filling in for the workshop. The slogan is the only
  // one today: the rest of the sample stands in for a job, which a real sheet
  // will have, while a slogan nobody has written simply never prints.
  const placeholderIds = useMemo(
    () => new Set(companyWorkshop.slogan?.trim() ? [] : ['slogan']),
    [companyWorkshop.slogan]
  )
  // What this document actually prints: its own mark when it has one, the
  // company logo otherwise. The same fallback the print routes apply, so the
  // canvas cannot promise a picture the paper will not carry.
  const workshop = useMemo(
    () => ({ ...companyWorkshop, logoUrl: template.logoUrl || companyWorkshop.logoUrl || '' }),
    [companyWorkshop, template.logoUrl]
  )

  /**
   * The labels the printed sheet uses, resolved from the same `pdf.json` the
   * print path reads. Without this the preview named its columns and panels in
   * English while the document it stands for printed in the reader's language.
   * Quote wording wins over the invoice's where the two differ.
   */
  const printLabels = useMemo<PrintLabels>(() => {
    const pdf = messages.pdf ?? {}
    return {
      ...(pdf.invoice ?? {}),
      ...(docType === 'quote' ? (pdf.quote ?? {}) : {}),
      ...(pdf.common ?? {}),
    }
  }, [messages, docType])
  const L = useCallback(
    (key: string, fallback: string) => printLabels[key] || fallback,
    [printLabels]
  )
  /** A section's name, or its id spaced out when nothing has named it. */
  const sectionName = useCallback(
    (id: string) => (tSection.has(id) ? tSection(id) : id.replace(/_/g, ' ')),
    [tSection]
  )

  const setLayout = useCallback(
    (next: InvoiceLayoutConfig) => {
      setLayouts((prev) => ({ ...prev, [docType]: next }))
      setDirty((prev) => ({ ...prev, [docType]: true }))
    },
    [docType]
  )

  const setTemplate = useCallback(
    (patch: Partial<DesignerTemplate>) => {
      setTemplates((prev) => ({ ...prev, [docType]: { ...prev[docType], ...patch } }))
      setDirty((prev) => ({ ...prev, [docType]: true }))
    },
    [docType]
  )

  /** What a workshop's own sheet says, with the sample standing in for a job. */
  const data: DocumentData = useMemo(() => {
    const sample = sampleTables(t, printLabels)
    const values = fieldValues(workshop, t, printLabels)
    return {
      fields: {
        ...values,
        // A custom field prints whatever the job carries; here it shows its
        // own name so the workshop can see where it will sit.
        ...Object.fromEntries(
          customFields
            .filter((f) => f.isActive)
            .map((f) => [toCustomFieldId(f.id), `${f.label || f.name}: ${t('sample.value')}`])
        ),
      },
      logoUrl: workshop.logoUrl || undefined,
      labels: printLabels,
      meta: {
        title: sample.title,
        number: sample.number,
        customerNumber: sample.customerNumber,
        date: sample.date,
        due: sample.due,
      },
      items: sample.items.map((item) => ({
        n: String(item.n),
        qty: item.qty,
        unit: item.unit,
        desc: item.desc,
        sub: item.sku,
        price: item.price,
        total: item.total,
      })),
      parts: sample.items
        .filter((item) => item.sku)
        .map((item) => ({
          ref: item.sku as string,
          desc: item.desc,
          qty: item.qty,
          price: item.price,
          total: item.total,
        })),
      labor: sample.items
        .filter((item) => !item.sku)
        .map((item) => ({
          desc: item.desc,
          qty: `${item.qty} ${item.unit}`,
          rate: item.price,
          total: item.total,
        })),
      findings: sample.findings,
      totals: [
        { label: L('subtotal', 'Subtotal'), value: sample.subtotal, kind: 'line' as const },
        {
          // The tax label carries the rate, the way the printed sheet does.
          label: fillTemplate(L('tax', 'Tax ({rate}%)'), { rate: '25' }),
          value: sample.tax,
          kind: 'line' as const,
        },
        { label: L('total', 'Total'), value: sample.total, kind: 'total' as const },
        // A settled invoice, so the payment line and the paid stamp can be
        // seen and styled. Quotes never carry payments, so theirs ends at the
        // total.
        ...(docType === 'invoice'
          ? [
              {
                label: `${sample.date} (Visa)`,
                value: `-${sample.total}`,
                kind: 'payment' as const,
              },
              { label: L('paidInFull', 'PAID IN FULL'), value: '', kind: 'paid' as const },
            ]
          : []),
      ],
      notes: { html: sample.notes },
      warranty: { duration: sample.warranty },
      payment: [
        { id: 'bank_account', label: L('bankAccount', 'Bank Account'), value: values.bank_account },
        {
          id: 'org_number',
          label: L('orgNumberLabel', 'Org. Number'),
          value: values.org_number || `${L('org', 'Org: {org}').replace('{org}', '123 456 789')}`,
        },
        {
          label: L('paymentTermsLabel', 'Payment Terms'),
          value: fillTemplate(L('netDays', '{days} Days'), { days: '10' }),
        },
        { label: L('dueDateLabel', 'Due Date'), value: sample.due },
      ],
      sectionLabels: {
        customer: L('billTo', 'Bill To'),
        vehicle: L('vehicle', 'Vehicle'),
        service: L('service', 'Service'),
        bank_account: L('paymentInformation', 'Payment Information'),
        general: L('customFieldsTitle', 'Additional Information'),
        findings: L('findings', 'Observations'),
      },
    }
  }, [workshop, customFields, t, printLabels, L, docType])

  const spec = useMemo(
    () => buildDocumentSpec(layout, themeOf(template, layout), data),
    [layout, template, data]
  )

  /** A template is the whole look, not only which sections are on. */
  const applyPreset = useCallback(
    (preset: (typeof layoutPresets)[number]) => {
      setLayout(buildLayoutFromPreset(preset))
      setTemplate(presetTemplatePatch(preset))
      setActiveDesigns((prev) => ({ ...prev, [docType]: `preset:${preset.id}` }))
      setView('designer')
    },
    [docType, setLayout, setTemplate]
  )

  /** Keep the named designs, in state and in settings, in one move. */
  const persistDesigns = useCallback((next: SavedDesign[]) => {
    setSavedDesigns(next)
    setSettings({ 'designer.savedDesigns': JSON.stringify(next) }).catch(() => {
      toast.error(t('couldNotSaveDesigns'))
    })
  }, [])

  /** Snapshot the current design under the name typed into the dialog. */
  const saveDesignAs = useCallback(() => {
    const name = designName.trim()
    if (!name) return
    const snapshot = {
      name,
      savedAt: new Date().toISOString(),
      layout: JSON.parse(JSON.stringify(layout)) as InvoiceLayoutConfig,
      template: { ...template },
    }
    // The same name means the same design: saving again updates it in place
    // rather than filling the gallery with near-copies.
    const existing = savedDesigns.find((d) => d.name.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      persistDesigns(savedDesigns.map((d) => (d.id === existing.id ? { ...d, ...snapshot } : d)))
      setActiveDesigns((prev) => ({ ...prev, [docType]: `design:${existing.id}` }))
      toast.success(t('designUpdated', { name }))
    } else {
      const id = designId()
      persistDesigns([{ id, ...snapshot }, ...savedDesigns].slice(0, 24))
      setActiveDesigns((prev) => ({ ...prev, [docType]: `design:${id}` }))
      toast.success(t('designSaved', { name }))
    }
    setNamingDesign(false)
  }, [designName, docType, layout, template, savedDesigns, persistDesigns])

  /** Bring a saved design back, onto whichever document is being edited. */
  const applyDesign = useCallback(
    (design: SavedDesign) => {
      // Merged, not taken as written: a design saved a year ago predates every
      // section and field added since, and loading it verbatim would hide them
      // with no way to switch them back on.
      setLayout(mergeWithDefaults(JSON.parse(JSON.stringify(design.layout)) as InvoiceLayoutConfig))
      setTemplates((prev) => ({ ...prev, [docType]: { ...design.template } }))
      // Its name becomes the working name, so the next save updates it.
      setDesignName(design.name)
      setActiveDesigns((prev) => ({ ...prev, [docType]: `design:${design.id}` }))
      setSelected(null)
      setDirty((prev) => ({ ...prev, [docType]: true }))
      setView('designer')
    },
    [docType, setLayout]
  )

  /** What a saved design would produce, for its card in the gallery. */
  const specForDesign = useCallback(
    (design: SavedDesign) =>
      buildDocumentSpec(design.layout, themeOf(design.template, design.layout), data),
    [data]
  )

  /** What a template would produce, for its card in the gallery. */
  const specFor = useCallback(
    (preset: (typeof layoutPresets)[number]) =>
      buildDocumentSpec(
        buildLayoutFromPreset(preset),
        {
          primary: preset.template.primaryColor,
          background: preset.template.backgroundColor || '#ffffff',
          text: preset.template.textColor || '#111827',
          muted: '#6b7280',
          accent: preset.document?.accentColor || preset.template.primaryColor,
          companyText:
            preset.template.headerStyle === 'framed' || preset.template.headerStyle === 'modern'
              ? '#ffffff'
              : preset.template.primaryColor,
          fontFamily: preset.template.fontFamily,
          fontSize: preset.document?.fontSize ?? BASE_FONT_SIZE,
          margin: preset.document?.margin ?? 40,
          rowPadding: preset.document?.rowPadding ?? 5,
          stripes: preset.document?.stripes !== false,
          stripeColor: preset.document?.stripeColor || '#f3f4f6',
          headerStyle: preset.template.headerStyle,
          frameSide: preset.template.frameSide ?? 'left',
          frameShadow: frameShadowWidth(undefined),
          frameRadius: 0,
          logoSize: 100,
        },
        data
      ),
    [data]
  )

  // A drop that references a section drawn while hidden (the borrowed
  // title) makes it real first, at the position it is drawn in.
  const materialize = materializeHiddenSection

  /**
   * Dropped back into the flow, before the named section (or last, on null):
   * it takes its place among the others and everything below it moves down,
   * which is what putting something back is supposed to do. It arrives full
   * width; joining a column is its own gesture.
   */
  const insertBefore = useCallback(
    (id: string, beforeId: string | null) => {
      const base = materialize(layout, beforeId)
      const anchors = { ...(base.anchors ?? {}) }
      delete anchors[id]

      const ordered = [...base.sections].sort((a, b) => a.order - b.order)
      const moved = ordered.find((s) => s.id === id)
      if (!moved) return
      const without = ordered.filter((s) => s.id !== id)
      const at = beforeId ? without.findIndex((s) => s.id === beforeId) : without.length
      // Dropping a section into the flow is asking to see it there, so a
      // hidden one (the borrowed title) becomes visible where it lands.
      without.splice(at === -1 ? without.length : at, 0, {
        ...moved,
        column: undefined,
        visible: true,
      })

      setLayout({
        ...base,
        anchors: Object.keys(anchors).length ? anchors : undefined,
        sections: without.map((s, i) => ({ ...s, order: i })),
      })
    },
    [layout, setLayout]
  )

  /**
   * Dropped into a column: the dragged section takes the given side and lands
   * before the named lane neighbour, or after the whole row when none. A
   * section it joins that had not chosen a side takes the other one, so a
   * full-width block turns into the other half of the pair.
   */
  const pairWith = useCallback(
    (id: string, side: 'left' | 'right', beforeId: string | null, afterId: string) => {
      if (id === afterId || id === beforeId) return
      const reference = beforeId ?? afterId
      const base = materialize(layout, reference)
      const anchors = { ...(base.anchors ?? {}) }
      delete anchors[id]

      const ordered = [...base.sections].sort((a, b) => a.order - b.order)
      const moved = ordered.find((s) => s.id === id)
      if (!moved || !ordered.some((s) => s.id === reference)) return
      const without = ordered.filter((s) => s.id !== id)
      const at = without.findIndex((s) => s.id === reference)
      without.splice(beforeId ? at : at + 1, 0, { ...moved, column: side, visible: true })

      setLayout({
        ...base,
        anchors: Object.keys(anchors).length ? anchors : undefined,
        sections: without.map((s, i) => ({
          ...s,
          order: i,
          column: s.id === reference && !s.column ? (side === 'left' ? 'right' : 'left') : s.column,
        })),
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
      // Placing a section by hand is asking to see it: the borrowed title is
      // drawn while its section is hidden, and anchoring it must not leave it
      // a ghost the generator glues back under the header.
      const hidden = anchor && layout.sections.some((s) => s.id === id && !s.visible)
      setLayout({
        ...layout,
        sections: hidden
          ? layout.sections.map((s) => (s.id === id ? { ...s, visible: true } : s))
          : layout.sections,
        anchors: Object.keys(anchors).length ? anchors : undefined,
      })
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

  /**
   * Leave for the settings page, asking first when there is unsaved work.
   *
   * A design is only on the sheet until Save writes it, and this tab was
   * opened fresh from settings, so walking away is the one click that can
   * throw away an afternoon with nothing to undo it.
   */
  const leaveForSettings = async () => {
    if (dirty.invoice || dirty.quote) {
      const go = await confirm({
        title: t('leaveTitle'),
        description: t('leaveBody'),
        confirmLabel: t('leaveConfirm'),
      })
      if (!go) return
    }
    router.push('/settings/templates')
  }

  const save = async () => {
    setSaving(true)
    try {
      const prefix = docType === 'invoice' ? 'invoice' : 'quote'
      // The stamp that graduates this organization from the classic
      // pre-designer rendering to whatever this designer shows.
      const stamped = { ...layout, version: DESIGNER_LAYOUT_VERSION }
      await Promise.all([
        docType === 'invoice' ? saveInvoiceLayoutConfig(stamped) : saveQuoteLayoutConfig(stamped),
        setSettings({
          [`${prefix}.primaryColor`]: template.primaryColor,
          [`${prefix}.backgroundColor`]: template.backgroundColor,
          [`${prefix}.textColor`]: template.textColor,
          [`${prefix}.companyTextColor`]: template.companyTextColor,
          [`${prefix}.frameBorderColor`]: template.frameBorderColor,
          [`${prefix}.frameShadow`]: template.frameShadow,
          [`${prefix}.frameRadius`]: String(template.frameRadius),
          [`${prefix}.activeDesign`]: activeDesigns[docType] ?? '',
          [`${prefix}.frameSide`]: template.frameSide,
          [`${prefix}.fontFamily`]: template.fontFamily,
          [`${prefix}.headerStyle`]: template.headerStyle,
          [`${prefix}.logoSize`]: String(template.logoSize),
          [`${prefix}.logo`]: template.logoUrl,
        }),
      ])
      setDirty((prev) => ({ ...prev, [docType]: false }))
      toast.success(t('saved'))
    } catch {
      toast.error(t('couldNotSave'))
    }
    setSaving(false)
  }

  if (view === 'gallery') {
    // A bounded height, not a minimum: the tool sits in a fixed, non-scrolling
    // frame, so a gallery that grows past the viewport has to scroll inside
    // itself. With min-h-screen it simply grew and the frame clipped it,
    // putting the last row of designs and the way back out of reach.
    return (
      <div className="flex h-full flex-col items-center overflow-y-auto px-8 py-14">
        <div className="w-full max-w-[1060px]">
          {/* The way out and the way on, both above the cards. Leaving should
              never need a scroll, and carrying on with the layout somebody
              already has is the commonest reason to open this page: below a
              screen of templates it was the hardest thing here to reach,
              while replacing that layout filled the view. */}
          <div className="mb-7 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.push('/settings/templates')}
              className="text-sm text-[#71767e] hover:text-[#1a1d21]"
            >
              ◂ {t('backToSettings')}
            </button>
            {/* Outlined rather than filled: it must be easy to find without
                shouting over the templates somebody may have come to browse. */}
            <button
              type="button"
              onClick={() => setView('designer')}
              className="rounded-[7px] border border-[#c9ccd1] bg-white px-3 py-1.5 text-sm font-medium text-[#2563eb] hover:border-[#2563eb]"
            >
              {t('continueCurrent')} →
            </button>
          </div>

          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#2563eb]">
            {t('eyebrow')}
          </div>
          <h1 className="mb-1.5 mt-2 text-[30px] tracking-tight">{t('galleryTitle')}</h1>
          <p className="mb-8 text-[15px] text-[#5b6068]">{t('galleryHint')}</p>

          {savedDesigns.length > 0 && (
            <>
              <h2 className="mb-3 text-[15px] font-semibold">{t('yourDesigns')}</h2>
              <div className="mb-8 grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                {savedDesigns.map((design) => {
                  const active = activeDesigns[docType] === `design:${design.id}`
                  return (
                    <div
                      key={design.id}
                      className="group relative rounded-[10px] border bg-white p-3.5 text-left transition-shadow hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,29,33,0.12)]"
                      style={{ borderColor: active ? '#2563eb' : '#e3e5e9' }}
                    >
                      {active && (
                        <span className="absolute left-2 top-2 z-10 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
                          {t('inUse')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => applyDesign(design)}
                        className="block w-full text-left"
                      >
                        <SpecThumbnail spec={specForDesign(design)} />
                        <div className="mt-2.5 truncate text-sm font-semibold">{design.name}</div>
                        <div className="text-xs leading-snug text-[#71767e]">
                          {t('savedOn', { date: new Date(design.savedAt).toLocaleDateString() })}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('deleteDesignTitle'),
                            description: t('deleteDesignBody', { name: design.name }),
                            confirmLabel: t('delete'),
                            destructive: true,
                          })
                          if (ok) persistDesigns(savedDesigns.filter((d) => d.id !== design.id))
                        }}
                        title={t('deleteDesign')}
                        className="absolute right-2 top-2 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[13px] text-[#8a8f97] shadow group-hover:flex hover:text-[#dc2626]"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
              <h2 className="mb-3 text-[15px] font-semibold">{t('templates')}</h2>
            </>
          )}

          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {layoutPresets.map((preset) => {
              const active = activeDesigns[docType] === `preset:${preset.id}`
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="relative rounded-[10px] border bg-white p-3.5 text-left transition-shadow hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,29,33,0.12)]"
                  style={{ borderColor: active ? '#2563eb' : '#e3e5e9' }}
                >
                  {active && (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
                      {t('inUse')}
                    </span>
                  )}
                  <SpecThumbnail spec={specFor(preset)} />
                  <div className="mt-2.5 text-sm font-semibold">
                    {tPreset.has(`${preset.id}.name`) ? tPreset(`${preset.id}.name`) : preset.id}
                  </div>
                  <div className="text-xs leading-snug text-[#71767e]">
                    {t(`headerStyle.${preset.template.headerStyle}.desc`)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const rail = [...layout.sections].sort((a, b) => a.order - b.order)
  /** Sections that actually drew something with the sample data. */
  const renderedIds = new Set(spec.blocks.map((b) => b.id))

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex h-[52px] flex-none items-center gap-4 border-b border-[#e3e5e9] bg-white px-3.5">
        <button
          type="button"
          onClick={() => setView('gallery')}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          ◂ {t('templates')}
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
              className="rounded-md px-3.5 py-1 text-[13px]"
              style={{
                background: docType === type ? '#fff' : 'transparent',
                fontWeight: docType === type ? 600 : 400,
                boxShadow: docType === type ? '0 1px 2px rgba(26,29,33,0.08)' : undefined,
              }}
            >
              {t(type)}
            </button>
          ))}
        </div>

        {docType === 'quote' && (
          <button
            type="button"
            onClick={() => {
              // The quote takes the invoice's whole design: arrangement,
              // placements and look, so nobody designs the same sheet twice.
              setLayouts((prev) => ({
                ...prev,
                quote: JSON.parse(JSON.stringify(prev.invoice)) as InvoiceLayoutConfig,
              }))
              setTemplates((prev) => ({ ...prev, quote: { ...prev.invoice } }))
              setSelected(null)
              setDirty((prev) => ({ ...prev, quote: true }))
              toast.success(t('copiedToQuote'))
            }}
            className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
          >
            ⧉ {t('useInvoiceDesign')}
          </button>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setRulers(!rulers)}
          className="rounded-[7px] border border-[#e3e5e9] px-2.5 py-1.5 text-[13px]"
          style={{ background: rulers ? '#eef2ff' : '#fff', color: rulers ? '#2563eb' : undefined }}
        >
          ⊞ {t('rulers')}
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

        {/* The way back out. The designer opens in its own tab, so there is no
            history to go back through, and the browser's own button would
            land somewhere else entirely. */}
        <button
          type="button"
          onClick={leaveForSettings}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          ◂ {t('backToSettings')}
        </button>

        {/* The tool is large enough that the manual is worth one click from
            inside it, rather than being something to go and look for. */}
        <DocsLink href="/docs/configuration/invoice-designer" variant="header" />

        <button
          type="button"
          onClick={() => {
            setDesignName((prev) => prev.trim() || t('defaultDesignName', { doc: t(docType) }))
            setNamingDesign(true)
          }}
          title={t('saveDesignHint')}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          ♡ {t('saveDesign')}
        </button>

        <button
          type="button"
          onClick={() => {
            setLayout(getDefaultInvoiceLayout())
            setSelected(null)
          }}
          className="rounded-[7px] border border-[#e3e5e9] px-3 py-1.5 text-[13px] font-medium hover:bg-[#f4f5f7]"
        >
          {t('reset')}
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty[docType]}
          className="rounded-[7px] bg-[#2563eb] px-4 py-[7px] text-[13px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {saving ? t('saving') : dirty[docType] ? t('save') : t('saved')}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex w-[252px] flex-none flex-col border-r border-[#e3e5e9] bg-white">
          <div className="px-2 pt-2.5">
            {/* Colors, typeface and page setup used to hide behind clicking
                empty paper; this puts them one click away, always. */}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex w-full items-center gap-2 rounded-[7px] py-2 pl-2 pr-2 text-left hover:bg-[#f4f5f7]"
              style={{ background: selected === null ? '#eef2ff' : undefined }}
            >
              <span className="text-[13px]">🎨</span>
              <span className="flex-1 text-[13.5px] font-medium">{t('documentStyling')}</span>
            </button>
          </div>
          <div className="px-3.5 pb-2.5 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[#8a8f97]">
            {t('sections')}
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
                <span className="flex-1 truncate text-[13.5px]">{sectionName(section.id)}</span>
                {section.column && (
                  <span className="rounded bg-[#eef2ff] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-[#2563eb]">
                    {section.column[0]}
                  </span>
                )}
                {/* A visible section can still have nothing to print, like a
                    slogan the company details have not filled in: name the
                    state instead of leaving an eye that seems to do nothing. */}
                {section.visible && !renderedIds.has(section.id) && (
                  <span
                    className="rounded bg-[#f4f5f7] px-1.5 py-0.5 text-[10px] text-[#8a8f97]"
                    title={t('sectionEmptyHint')}
                  >
                    {t('sectionEmpty')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    patchSection(section.id, { visible: !section.visible })
                  }}
                  className="px-0.5"
                  style={{ color: section.visible ? '#5b6068' : '#c9ccd1' }}
                  title={section.visible ? t('sectionShownHint') : t('sectionHiddenHint')}
                >
                  {section.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-[#eceef1] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#8a8f97]">
            {t('railHint')}
          </div>
        </div>

        {selected && layout.anchors?.[selected] && (
          <button
            type="button"
            onClick={() => setAnchor(selected, undefined)}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-[#1a1d21] px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            {t('returnToFlow', { section: sectionName(selected) })}
          </button>
        )}
        <SpecCanvas
          spec={spec}
          selected={selected}
          onSelect={setSelected}
          onAnchor={setAnchor}
          onInsert={insertBefore}
          onPair={pairWith}
          pairable={COLUMN_ELIGIBLE_SECTIONS}
          placeholderIds={placeholderIds}
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
          logoUrl={workshop.logoUrl}
          ownLogo={!!template.logoUrl}
          sloganSet={!!companyWorkshop.slogan?.trim()}
          onLogo={(url) => setTemplate({ logoUrl: url })}
        />
      </div>

      <Dialog open={namingDesign} onOpenChange={setNamingDesign}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('saveDialogTitle')}</DialogTitle>
            <DialogDescription>{t('saveDialogBody')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveDesignAs()
            }}
          >
            <Input
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder={t('designNamePlaceholder')}
              maxLength={60}
              autoFocus
            />
            {savedDesigns.some(
              (d) => d.name.trim().toLowerCase() === designName.trim().toLowerCase()
            ) && <p className="mt-2 text-xs text-muted-foreground">{t('nameExists')}</p>}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setNamingDesign(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!designName.trim()}>
                {savedDesigns.some(
                  (d) => d.name.trim().toLowerCase() === designName.trim().toLowerCase()
                )
                  ? t('updateDesign')
                  : t('saveDesign')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
