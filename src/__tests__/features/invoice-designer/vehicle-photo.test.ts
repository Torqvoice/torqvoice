/**
 * @vitest-environment node
 *
 * The vehicle's photo on paper. An opt-in field of the Vehicle block with a
 * style of its own: sharp beside the lines, or faded behind the block. Off in
 * every default, every starting point and every design saved before it, so
 * those print the same sheet with a photo as without; once on, the photo
 * prints where the design puts it and nowhere else, and an issued invoice
 * keeps the photo it was issued with.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURES = path.join(tmpdir(), 'torqvoice-vehicle-photo-print')

const db = {
  serviceRecord: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
  vehicle: { findFirst: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/resolve-upload-path', () => ({
  resolveUploadPath: (url: string) => path.join(FIXTURES, url.split('/').pop() ?? ''),
}))
vi.mock('@/features/meters/Lib/meters.server', () => ({
  printableMeterReadings: async () => [],
  activeMeterTypes: async () => [],
}))
vi.mock('@/features/equipment/Lib/equipmentPrint.server', () => ({
  NO_EQUIPMENT: { job: [], vehicle: [] },
  printableEquipment: async () => ({ job: [], vehicle: [] }),
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => ({ customFields: true })) }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
  getRecordCustomFieldsForPrint: async () => [],
}))
vi.mock('@/features/invoice-designer/Lib/designRules.server', () => ({
  designRuleSubjectOf: () => ({}),
  findRuleDesign: async () => null,
}))
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  memberSignatureDataUri: async () => undefined,
}))
vi.mock('@/features/condition-map/Lib/loadMarks.server', () => ({
  loadVisitConditionMap: async () => null,
  loadMarkTypeRows: async () => [],
}))
const ensureAssetSnapshot = vi.fn(async (_org: string, uri: string) =>
  uri.startsWith('data:image/jpeg') ? 'asset-photo' : 'asset-other'
)
vi.mock('@/features/invoice-designer/Lib/designSnapshots', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureDesignSnapshot: async () => 'design-snap',
  ensureAssetSnapshot: (org: string, uri: string) => ensureAssetSnapshot(org, uri),
}))
vi.mock('@/features/integrations/Lib/events', () => ({ notifyIntegrations: vi.fn() }))

const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')
const { buildQuotePrintSpec } = await import('@/features/invoice-designer/Pdf/buildQuotePrint')
const { buildWorkOrderPrintSpec } = await import(
  '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
)
const { sectionFields } = await import('@/features/invoice-designer/Spec/buildSpec')
const { walk } = await import('@/features/invoice-designer/Spec/documentSpec')
const { vehiclePhotoStyleOf } = await import('@/features/invoice-designer/Lib/vehiclePhoto')
const { buildSampleData } = await import('@/features/invoice-designer/Components/sample')
const { SpecPdfPage } = await import('@/features/invoice-designer/Pdf/SpecPdf')
const { SpecSheet } = await import('@/features/invoice-designer/Render/SpecSheet')
const schema = await import('@/features/settings/Schema/invoiceLayoutSchema')
const { buildLayoutFromPreset, layoutPresets, workOrderPresets } = await import(
  '@/features/settings/Schema/layoutPresets'
)
const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData, reissueInvoice } = await import(
  '@/features/invoices/Lib/issueInvoice'
)
const { clearVehiclePhotoCache } = await import(
  '@/features/invoice-designer/Lib/vehiclePhoto.server'
)
await import('@/features/vehicles/Components/invoice-pdf/fonts')

const {
  DESIGNER_LAYOUT_VERSION,
  GRANDFATHERED_FIELDS,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  isOptInField,
  mergeWithDefaults,
} = schema
type InvoiceLayoutConfig =
  import('@/features/settings/Schema/invoiceLayoutSchema').InvoiceLayoutConfig
type InvoiceData = import('@/features/vehicles/Components/invoice-pdf/types').InvoiceData
type DocumentSpec = import('@/features/invoice-designer/Spec/documentSpec').DocumentSpec
type Node = import('@/features/invoice-designer/Spec/documentSpec').Node

/* eslint-disable @typescript-eslint/no-explicit-any */

const BESIDE_SRC = 'data:image/jpeg;base64,QkVTSURF'
const FADED_SRC = 'data:image/jpeg;base64,RkFERUQ='
const PHOTO = { beside: { src: BESIDE_SRC, aspect: 4 / 3 }, faded: FADED_SRC }

const invoiceData = {
  id: 'svc1',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-26'),
  invoiceDate: new Date('2026-09-26'),
  shopName: 'Shop',
  techName: null,
  mileage: 12845,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter', email: null, phone: null, address: null, company: null },
  vehicle: {
    make: 'Volvo',
    model: 'FH',
    year: 2019,
    vin: null,
    licensePlate: 'AB 12345',
    mileage: 12845,
    customer: null,
  },
  vehiclePhoto: PHOTO,
} as unknown as InvoiceData

const bare = { ...invoiceData, vehiclePhoto: undefined } as unknown as InvoiceData

const quoteOf = (data: InvoiceData) =>
  ({
    ...(data as unknown as Record<string, unknown>),
    quoteNumber: 'Q-1',
    status: 'draft',
    createdAt: new Date('2026-09-26'),
    validUntil: null,
    notes: null,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
  }) as never

const job = {
  orderNumber: '1',
  statusLabel: 'Open',
  concerns: [],
  printedAt: new Date('2026-09-26T00:00:00Z'),
} as never

/** The layout as the designer saves it with the photo on, in a style. */
function withPhoto(layout: InvoiceLayoutConfig, style?: 'faded'): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((section) =>
      section.id === 'vehicle'
        ? {
            ...section,
            visible: true,
            ...(style ? { photoStyle: style } : {}),
            fields: (section.fields ?? []).map((field) =>
              field.id === 'vehicle_photo' ? { ...field, visible: true } : field
            ),
          }
        : section
    ),
  }
}

const locale = 'en-GB'
const invoiceSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  buildInvoicePrintSpec({ data, locale, template: { layoutConfig } as never })
const quoteSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  buildQuotePrintSpec({ data: quoteOf(data), locale, layoutConfig })
const workOrderSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  buildWorkOrderPrintSpec({ data, job, locale, template: { layoutConfig } as never })

/** Every node of a block, and of the whole sheet. */
function nodesOf(node: Node): Node[] {
  const out: Node[] = []
  walk(node, (n) => out.push(n))
  return out
}
const vehicleBlock = (spec: DocumentSpec) => spec.blocks.find((b) => b.id === 'vehicle')
const imagesIn = (node: Node | undefined) =>
  node ? nodesOf(node).filter((n) => n.kind === 'image') : []
const backgrounds = (spec: DocumentSpec) =>
  spec.blocks.flatMap((block) =>
    nodesOf(block.content)
      .filter((n) => (n.kind === 'stack' || n.kind === 'row') && n.style?.backgroundImage)
      .map((n) => ({ block: block.id, node: n }))
  )

describe('the vehicle photo is opt-in', () => {
  it('is an opt-in field of the vehicle block, never a grandfathered one', () => {
    expect(isOptInField('vehicle', 'vehicle_photo')).toBe(true)
    expect(Object.values(GRANDFATHERED_FIELDS).flat()).not.toContain('vehicle_photo')
  })

  it('is off in every default layout and starting point', () => {
    for (const type of ['invoice', 'work_order', 'certificate'] as const) {
      const vehicle = getDefaultLayout(type).sections.find((s) => s.id === 'vehicle')
      expect(vehicle?.fields?.find((f) => f.id === 'vehicle_photo')?.visible, type).toBe(false)
      expect(vehiclePhotoStyleOf(getDefaultLayout(type)), type).toBeNull()
    }
    for (const preset of [...layoutPresets, ...workOrderPresets]) {
      expect(vehiclePhotoStyleOf(buildLayoutFromPreset(preset)), preset.id).toBeNull()
    }
  })

  it('prints the same sheet with a photo as without, on every default and starting point', () => {
    for (const layout of [getDefaultInvoiceLayout(), ...layoutPresets.map(buildLayoutFromPreset)]) {
      expect(JSON.stringify(invoiceSpec(layout))).toBe(JSON.stringify(invoiceSpec(layout, bare)))
      expect(JSON.stringify(quoteSpec(layout))).toBe(JSON.stringify(quoteSpec(layout, bare)))
    }
    for (const layout of [
      getDefaultLayout('work_order'),
      ...workOrderPresets.map(buildLayoutFromPreset),
    ]) {
      expect(JSON.stringify(workOrderSpec(layout))).toBe(
        JSON.stringify(workOrderSpec(layout, bare))
      )
    }
  })

  it('stays off in a design saved before it existed, with every vehicle line on', () => {
    for (const layout of [getDefaultInvoiceLayout(), getDefaultLayout('work_order')]) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'vehicle'
            ? {
                ...s,
                visible: true,
                fields: s.fields
                  ?.filter((f) => f.id !== 'vehicle_photo')
                  .map((f) => ({ ...f, visible: true })),
              }
            : s
        ),
      }
      const merged = mergeWithDefaults(saved)
      const vehicle = merged.sections.find((s) => s.id === 'vehicle')
      expect(vehicle?.fields?.find((f) => f.id === 'vehicle_photo')?.visible).toBe(false)
      expect(vehiclePhotoStyleOf(saved)).toBeNull()
      expect(JSON.stringify(invoiceSpec(merged))).toBe(JSON.stringify(invoiceSpec(merged, bare)))
    }
  })

  it('stays off in a vehicle block that never listed its lines', () => {
    const vehicle = getDefaultInvoiceLayout().sections.find((s) => s.id === 'vehicle')
    if (!vehicle) throw new Error('no vehicle section')
    const { fields: _fields, ...unlisted } = vehicle
    expect(sectionFields(unlisted)).not.toContain('vehicle_photo')
  })

  it('is kept by the saved layout’s schema, style and all', () => {
    const saved = withPhoto(getDefaultInvoiceLayout(), 'faded')
    const parsed = schema.invoiceLayoutConfigSchema.parse(saved)
    expect(parsed.sections.find((s) => s.id === 'vehicle')?.photoStyle).toBe('faded')
    expect(vehiclePhotoStyleOf(parsed)).toBe('faded')
    expect(vehiclePhotoStyleOf(withPhoto(getDefaultInvoiceLayout()))).toBe('beside')
  })

  it('is never offered on a certificate', () => {
    const certificate = withPhoto(getDefaultLayout('certificate'))
    expect(vehiclePhotoStyleOf(certificate)).toBeNull()
  })
})

describe('once placed', () => {
  const specs = (style?: 'faded') => [
    invoiceSpec(withPhoto(getDefaultInvoiceLayout(), style)),
    quoteSpec(withPhoto(getDefaultInvoiceLayout(), style)),
    workOrderSpec(withPhoto(getDefaultLayout('work_order'), style)),
  ]

  it('prints the photo beside the vehicle’s lines, at its own proportions', () => {
    for (const spec of specs()) {
      const images = imagesIn(vehicleBlock(spec)?.content)
      expect(images).toHaveLength(1)
      const image = images[0] as Extract<Node, { kind: 'image' }>
      expect(image.src).toBe(BESIDE_SRC)
      expect(image.maxWidth / image.maxHeight).toBeCloseTo(4 / 3, 1)
      // Never more than about a third of a block in a column.
      expect(image.maxWidth).toBeLessThanOrEqual(150)
      // Nothing behind any block.
      expect(backgrounds(spec)).toEqual([])
      // The lines still print beside it.
      expect(JSON.stringify(vehicleBlock(spec))).toContain('Volvo')
    }
  })

  it('puts the faded photo behind the vehicle block, and behind nothing else', () => {
    for (const spec of specs('faded')) {
      const found = backgrounds(spec)
      expect(found).toHaveLength(1)
      expect(found[0].block).toBe('vehicle')
      expect(found[0].node).toBe(vehicleBlock(spec)?.content)
      expect((found[0].node as any).style.backgroundImage).toBe(FADED_SRC)
      expect(imagesIn(vehicleBlock(spec)?.content)).toEqual([])
      // Never as a URL, and never next to the line items or totals.
      const totals = spec.blocks.find((b) => b.id === 'totals')
      if (totals) expect(JSON.stringify(totals)).not.toContain(FADED_SRC)
    }
  })

  it('prints every line over the faded photo in the title ink, never the grey detail ink', () => {
    const plain = JSON.stringify(
      vehicleBlock(invoiceSpec(withPhoto(getDefaultInvoiceLayout())))?.content
    )
    const faded = JSON.stringify(vehicleBlock(specs('faded')[0])?.content)
    // The grey detail ink of the plain block is gone over the photo.
    expect(plain).toContain('#6b7280')
    expect(faded).not.toContain('#6b7280')
  })

  it('prints nothing for a vehicle without a photo', () => {
    for (const style of [undefined, 'faded'] as const) {
      const layout = withPhoto(getDefaultInvoiceLayout(), style)
      const off = { ...getDefaultInvoiceLayout(), version: DESIGNER_LAYOUT_VERSION }
      expect(JSON.stringify(invoiceSpec(layout, bare))).toBe(JSON.stringify(invoiceSpec(off, bare)))
      expect(imagesIn(vehicleBlock(invoiceSpec(layout, bare))?.content)).toEqual([])
      expect(backgrounds(invoiceSpec(layout, bare))).toEqual([])
    }
  })
})

describe('the designer’s sample', () => {
  const sample = () =>
    buildSampleData(
      { name: 'Shop', address: '', phone: '', email: '', logoUrl: '' } as never,
      [],
      ((key: string) => key) as never,
      {},
      'invoice'
    )

  it('carries a stand-in photo in both forms, drawn without any asset', () => {
    const photo = sample().vehiclePhoto
    expect(photo?.beside?.src).toMatch(/^data:image\/svg\+xml/)
    expect(photo?.faded).toMatch(/^data:image\/svg\+xml/)
  })
})

describe('the renderers', () => {
  let jpeg: string
  beforeAll(async () => {
    const bytes = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#e5e7eb' },
    })
      .jpeg()
      .toBuffer()
    jpeg = `data:image/jpeg;base64,${bytes.toString('base64')}`
  })

  const withJpeg = () =>
    ({
      ...invoiceData,
      vehiclePhoto: { beside: { src: jpeg, aspect: 4 / 3 }, faded: jpeg },
    }) as never

  it('draw the faded photo as the vehicle block’s CSS background', () => {
    const spec = invoiceSpec(withPhoto(getDefaultInvoiceLayout(), 'faded'), withJpeg())
    const html = renderToStaticMarkup(React.createElement(SpecSheet, { spec }))
    expect(html).toContain('background-image:url(&quot;data:image/jpeg;base64,')
    expect(html).toContain('background-size:cover')
  })

  it('print both styles to a PDF', async () => {
    for (const style of [undefined, 'faded'] as const) {
      const spec = invoiceSpec(withPhoto(getDefaultInvoiceLayout(), style), withJpeg())
      const pdf = await renderToBuffer(
        React.createElement(Document, null, React.createElement(SpecPdfPage, { spec })) as any
      )
      expect(Buffer.from(pdf).toString('latin1')).toContain('/Subtype /Image')
    }
  })
})

// ---------------------------------------------------------------------------
// Issued invoices keep the photo they were issued with.
// ---------------------------------------------------------------------------

const PHOTO_URL = '/api/protected/files/org-1/vehicles/car.jpg'

const record = (over: Record<string, unknown> = {}): any => ({
  id: 'rec-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  customerId: 'cust-1',
  inspectionId: null,
  designId: null,
  title: 'Service',
  type: 'maintenance',
  serviceDate: new Date('2026-09-24T09:00:00Z'),
  invoiceNumber: '2026-0042',
  mileage: 84120,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  discountValue: 0,
  manuallyPaid: false,
  conditionMapOnInvoice: null,
  techName: null,
  issuedAt: null,
  issuedData: null,
  editUnlockedAt: null,
  partItems: [],
  laborItems: [{ description: 'Oil change', hours: 1, rate: 100, total: 100 }],
  attachments: [],
  payments: [],
  technician: null,
  customer: { name: 'Alex Carter', invoiceDesignId: null },
  vehicle: {
    customerId: 'cust-1',
    make: 'Volvo',
    model: 'FH',
    year: 2020,
    vin: null,
    licensePlate: 'AB 12345',
    hsn: null,
    tsn: null,
    fleetNumber: null,
    mileage: 84120,
    customer: null,
  },
  issuedDesignSnapshot: null,
  issuedLogoSnapshot: null,
  issuedSignatureSnapshot: null,
  issuedVehiclePhotoSnapshot: null,
  createdBy: { id: 'user-1', name: 'Kari' },
  ...over,
})

const layoutSetting = (style?: 'faded') => ({
  key: 'invoice.layoutConfig',
  value: JSON.stringify(withPhoto(getDefaultInvoiceLayout(), style)),
})

describe('an issued invoice', () => {
  beforeAll(async () => {
    mkdirSync(FIXTURES, { recursive: true })
    // A busy, colourful picture, larger than the print needs.
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 110, g: 110, b: 110 },
        noise: { type: 'gaussian', mean: 110, sigma: 70 },
      },
    })
      .jpeg()
      .toFile(path.join(FIXTURES, 'car.jpg'))
    writeFileSync(path.join(FIXTURES, 'not-a-photo.jpg'), 'just some text')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    clearVehiclePhotoCache()
    db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
    db.vehicleFinding.findMany.mockResolvedValue([])
    db.documentDesign.findFirst.mockResolvedValue(null)
    db.appSetting.findMany.mockResolvedValue([layoutSetting()])
    db.vehicle.findFirst.mockResolvedValue({ imageUrl: PHOTO_URL })
    db.serviceRecord.update.mockResolvedValue({})
  })

  async function issue() {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
    const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
    const source = live!.vehiclePhotoSource!
    const bytes = new Uint8Array(Buffer.from(source.split(',')[1], 'base64'))
    return {
      source,
      issued: record({
        issuedAt: new Date('2026-09-25T10:00:00Z'),
        issuedData,
        issuedVehiclePhotoSnapshot: { id: 'asset-photo', mimeType: 'image/jpeg', data: bytes },
      }),
    }
  }

  it('reads the vehicle’s photo for a draft whose design prints it, resized', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const draft = await assembleInvoicePrint('rec-1')
    const beside = draft?.data.vehiclePhoto?.beside
    expect(beside?.src).toMatch(/^data:image\/jpeg;base64,/)
    expect(beside?.aspect).toBeCloseTo(4 / 3, 2)
    const meta = await sharp(Buffer.from(beside!.src.split(',')[1], 'base64')).metadata()
    expect(meta.width).toBe(600)
    // Asked in this workshop only.
    expect(db.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'veh-1', organizationId: 'org-1' },
      select: { imageUrl: true },
    })
  })

  it('reads nothing for a design that does not print it', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const draft = await assembleInvoicePrint('rec-1')
    expect(draft?.data.vehiclePhoto).toBeUndefined()
    expect(draft?.vehiclePhotoSource).toBeUndefined()
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
  })

  it('prints as if the option were off for a file that is not a picture', async () => {
    db.vehicle.findFirst.mockResolvedValue({
      imageUrl: '/api/protected/files/org-1/vehicles/not-a-photo.jpg',
    })
    db.serviceRecord.findUnique.mockResolvedValue(record())
    expect((await assembleInvoicePrint('rec-1'))?.data.vehiclePhoto).toBeUndefined()
  })

  it('never reads a photo of another workshop', async () => {
    db.vehicle.findFirst.mockResolvedValue({
      imageUrl: '/api/protected/files/org-2/vehicles/car.jpg',
    })
    db.serviceRecord.findUnique.mockResolvedValue(record())
    expect((await assembleInvoicePrint('rec-1'))?.data.vehiclePhoto).toBeUndefined()
  })

  it('keeps the photo with the issue', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', issuedAt: new Date() })
    db.serviceRecord.findUnique.mockResolvedValue(record())
    await reissueInvoice('rec-1', 'org-1')
    const data = db.serviceRecord.update.mock.calls[0][0].data
    expect(data.issuedVehiclePhotoSnapshotId).toBe('asset-photo')
  })

  it('keeps none for a design that prints none', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    db.serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', issuedAt: new Date() })
    db.serviceRecord.findUnique.mockResolvedValue(record())
    await reissueInvoice('rec-1', 'org-1')
    expect(db.serviceRecord.update.mock.calls[0][0].data.issuedVehiclePhotoSnapshotId).toBeNull()
  })

  it('reprints its frozen photo, whatever happened to the vehicle’s since', async () => {
    const { source, issued } = await issue()
    db.vehicle.findFirst.mockClear()
    // The photo was deleted from the vehicle after the invoice went out.
    db.vehicle.findFirst.mockResolvedValue({ imageUrl: null })
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    const reprint = await assembleInvoicePrint('rec-1')
    expect(reprint?.issuedAt).not.toBeNull()
    expect(reprint?.data.vehiclePhoto?.beside?.src).toBe(source)
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
    const spec = buildInvoicePrintSpec({
      data: reprint!.data,
      template: reprint!.template,
      locale,
    })
    expect(imagesIn(vehicleBlock(spec)?.content)).toHaveLength(1)
  })

  it('fades its frozen photo the same way, light enough for the block’s inks', async () => {
    const { issued } = await issue()
    db.appSetting.findMany.mockResolvedValue([layoutSetting('faded')])
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    const reprint = await assembleInvoicePrint('rec-1')
    const faded = reprint?.data.vehiclePhoto?.faded
    expect(faded).toMatch(/^data:image\/jpeg;base64,/)
    const stats = await sharp(Buffer.from(faded!.split(',')[1], 'base64')).stats()
    const { vehicleBlockTone } = await import('@/features/invoice-designer/Lib/vehiclePhoto')
    const tone = vehicleBlockTone(reprint!.template.layoutConfig!, reprint!.template)
    expect(tone.mode).toBe('floor')
    // Within the JPEG's own margin of the floor, on every channel.
    for (const channel of stats.channels.slice(0, 3)) {
      expect(channel.min).toBeGreaterThanOrEqual(tone.value - 3)
    }
  })

  it('prints none when it was issued before photos could be printed', async () => {
    const { issued } = await issue()
    db.vehicle.findFirst.mockClear()
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, issuedVehiclePhotoSnapshot: null })
    const reprint = await assembleInvoicePrint('rec-1')
    expect(reprint?.data.vehiclePhoto).toBeUndefined()
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
  })
})
