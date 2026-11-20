/**
 * @vitest-environment node
 *
 * Equipment on paper. A section of its own that no sheet prints until a
 * design switches it on: every default, starting point and design saved
 * before it prints the same sheet with equipment as without. Placed, it
 * prints the list the design chose (the items the job works on, or all of
 * the vehicle's) with the columns the design chose, and an issued invoice
 * keeps the equipment it went out with.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EQUIPMENT_COLUMNS,
  type PrintableEquipmentLists,
} from '@/features/equipment/Lib/equipmentPrint'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
}
const equipment = vi.fn(
  async (..._args: unknown[]): Promise<PrintableEquipmentLists> => ({ job: [], vehicle: [] })
)
vi.mock('@/features/equipment/Lib/equipmentPrint.server', () => ({
  NO_EQUIPMENT: { job: [], vehicle: [] },
  printableEquipment: (...args: unknown[]) => equipment(...args),
}))
vi.mock('@/features/meters/Lib/meters.server', () => ({
  printableMeterReadings: async () => [],
  activeMeterTypes: async () => [],
}))
vi.mock('@/lib/db', () => ({ db }))
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

const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')
const { buildQuotePrintSpec } = await import('@/features/invoice-designer/Pdf/buildQuotePrint')
const { buildWorkOrderPrintSpec } = await import(
  '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
)
const { buildSampleData } = await import('@/features/invoice-designer/Components/sample')
const {
  CERTIFICATE_SECTIONS,
  DESIGNER_LAYOUT_VERSION,
  GRANDFATHERED_FIELDS,
  OPT_IN_FIELDS,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  mergeWithDefaults,
} = await import('@/features/settings/Schema/invoiceLayoutSchema')
const { buildLayoutFromPreset, layoutPresets, workOrderPresets } = await import(
  '@/features/settings/Schema/layoutPresets'
)
const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData } = await import('@/features/invoices/Lib/issueInvoice')

type Layout = ReturnType<typeof getDefaultInvoiceLayout>
type Section = Layout['sections'][number]
/* eslint-disable @typescript-eslint/no-explicit-any */

const CRANE = {
  type: 'Crane',
  make: 'Hiab',
  model: 'X-HiPro 192',
  serialNumber: 'HB-19-04412',
  manufactureYear: 2019,
  installDate: '2019-06-03',
  ratedCapacity: '18.5 tm',
  nextExaminationDue: '2027-02-10',
  lastExaminedAt: '2026-02-10',
  certificateReference: 'EX-0117',
  notes: null,
  meters: [{ name: 'Engine hours', unit: 'hrs', value: 812.5 }],
}
const TAIL_LIFT = {
  ...CRANE,
  type: 'Tail lift',
  make: 'Dhollandia',
  model: 'DH-LM.15',
  serialNumber: 'DH21-88310',
  manufactureYear: 2021,
  meters: [],
}
const LISTS: PrintableEquipmentLists = { job: [CRANE], vehicle: [CRANE, TAIL_LIFT] }

const invoiceData = (lists: PrintableEquipmentLists | undefined = LISTS) =>
  ({
    id: 'svc1',
    title: 'Service',
    description: null,
    type: 'repair',
    serviceDate: new Date('2026-09-26'),
    invoiceDate: new Date('2026-09-26'),
    shopName: 'Shop',
    techName: null,
    mileage: 12845,
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
    equipment: lists,
  }) as any

const NONE: PrintableEquipmentLists = { job: [], vehicle: [] }

const quoteOf = (data: any) =>
  ({
    ...data,
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

const locale = 'en-GB'
const invoiceSpec = (layoutConfig: Layout, lists?: PrintableEquipmentLists, extra = {}) =>
  buildInvoicePrintSpec({
    data: invoiceData(lists),
    locale,
    template: { layoutConfig } as never,
    ...extra,
  })
const quoteSpec = (layoutConfig: Layout, lists?: PrintableEquipmentLists) =>
  buildQuotePrintSpec({ data: quoteOf(invoiceData(lists)), locale, layoutConfig })
const workOrderSpec = (layoutConfig: Layout, lists?: PrintableEquipmentLists) =>
  buildWorkOrderPrintSpec({
    data: invoiceData(lists),
    job,
    locale,
    template: { layoutConfig } as never,
  })

/** The layout as the designer saves it with the Equipment section placed and on. */
function withEquipmentOn(layout: Layout, patch: Partial<Section> = {}): Layout {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((section) =>
      section.id === 'equipment' ? { ...section, visible: true, ...patch } : section
    ),
  }
}

/** The Equipment block's table and title, or nothing when it printed none. */
function equipmentOf(spec: any) {
  const block = spec.blocks.find((b: any) => b.id === 'equipment')
  if (!block) return null
  const children = block.content.children ?? []
  const table = children.find((c: any) => c.kind === 'table')
  return {
    title: children.find((c: any) => c.kind === 'text')?.text as string | undefined,
    heads: table.columns.map((c: any) => c.label) as string[],
    rows: table.rows.map((row: any) => table.columns.map((c: any) => row[c.key])) as string[][],
  }
}

/** Exactly these columns on, in this order, and every other column off. */
const fieldsOn = (ids: string[]) => [
  ...ids.map((id) => ({ id, visible: true })),
  ...EQUIPMENT_COLUMNS.filter((id) => !ids.includes(id)).map((id) => ({ id, visible: false })),
]

describe('the Equipment section in a design', () => {
  it('is a section waiting to be switched on, never a grandfathered or opt-in field', () => {
    expect(GRANDFATHERED_FIELDS.equipment).toBeUndefined()
    expect(Object.values(GRANDFATHERED_FIELDS).flat()).not.toContain('equipment')
    expect(OPT_IN_FIELDS.equipment).toBeUndefined()
    // A certificate prints the inspection, not the vehicle's equipment.
    expect(CERTIFICATE_SECTIONS.map((s) => s.id)).not.toContain('equipment')
  })

  it('is off in every default layout and every starting point, with the sample columns', () => {
    const layouts = [
      getDefaultInvoiceLayout(),
      getDefaultLayout('work_order'),
      ...layoutPresets.map(buildLayoutFromPreset),
      ...workOrderPresets.map(buildLayoutFromPreset),
    ]
    for (const layout of layouts) {
      const section = layout.sections.find((s) => s.id === 'equipment')
      expect(section?.visible).toBe(false)
      expect(section?.scope).toBeUndefined()
      expect(section?.fields?.filter((f) => f.visible).map((f) => f.id)).toEqual([
        'type',
        'make',
        'model',
        'manufacture_year',
        'serial_number',
      ])
    }
  })

  it('prints the same sheet with equipment as without, on every default and starting point', () => {
    for (const layout of [getDefaultInvoiceLayout(), ...layoutPresets.map(buildLayoutFromPreset)]) {
      expect(JSON.stringify(invoiceSpec(layout))).toBe(JSON.stringify(invoiceSpec(layout, NONE)))
      expect(JSON.stringify(quoteSpec(layout))).toBe(JSON.stringify(quoteSpec(layout, NONE)))
    }
    for (const layout of [
      getDefaultLayout('work_order'),
      ...workOrderPresets.map(buildLayoutFromPreset),
    ]) {
      expect(JSON.stringify(workOrderSpec(layout))).toBe(
        JSON.stringify(workOrderSpec(layout, NONE))
      )
    }
  })

  it('stays off in a design saved before it existed, after the vehicle’s own panels', () => {
    for (const [layout, before] of [
      [getDefaultInvoiceLayout(), 'service'],
      [getDefaultLayout('work_order'), 'job_qr'],
    ] as const) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections
          .filter((s) => s.id !== 'equipment')
          .map((s, order) => ({ ...s, visible: true, order })),
      }
      const merged = mergeWithDefaults(saved)
      const ordered = [...merged.sections].sort((a, b) => a.order - b.order).map((s) => s.id)
      expect(merged.sections.find((s) => s.id === 'equipment')?.visible).toBe(false)
      expect(ordered.indexOf('equipment')).toBe(ordered.indexOf(before) + 1)
      expect(JSON.stringify(invoiceSpec(merged))).toBe(JSON.stringify(invoiceSpec(merged, NONE)))
    }
  })
})

describe('printing the Equipment section', () => {
  it('lists everything on the vehicle by default, with the sample invoice’s columns', () => {
    for (const spec of [
      invoiceSpec(withEquipmentOn(getDefaultInvoiceLayout())),
      quoteSpec(withEquipmentOn(getDefaultInvoiceLayout())),
      workOrderSpec(withEquipmentOn(getDefaultLayout('work_order'))),
    ]) {
      expect(equipmentOf(spec)).toEqual({
        title: 'Equipment',
        heads: ['Type', 'Make', 'Model', 'Year', 'Serial no.'],
        rows: [
          // The year of manufacture as the year alone.
          ['Crane', 'Hiab', 'X-HiPro 192', '2019', 'HB-19-04412'],
          ['Tail lift', 'Dhollandia', 'DH-LM.15', '2021', 'DH21-88310'],
        ],
      })
    }
  })

  it('lists only the items the job works on when the design asks for those', () => {
    const spec = invoiceSpec(withEquipmentOn(getDefaultInvoiceLayout(), { scope: 'job' }))
    expect(equipmentOf(spec)?.rows.map((row) => row[0])).toEqual(['Crane'])
  })

  it('prints the chosen columns in the chosen order, under the workshop’s own heading', () => {
    const spec = invoiceSpec(
      withEquipmentOn(getDefaultInvoiceLayout(), {
        text: 'Attached equipment details',
        fields: fieldsOn(['serial_number', 'type', 'next_examination', 'meters', 'notes']),
      })
    )
    expect(equipmentOf(spec)).toEqual({
      title: 'Attached equipment details',
      heads: ['Serial no.', 'Type', 'Next examination', 'Meter readings', 'Notes'],
      rows: [
        ['HB-19-04412', 'Crane', 'Feb 10, 2027', 'Engine hours: 812.5\u00a0hrs', '-'],
        ['DH21-88310', 'Tail lift', 'Feb 10, 2027', '-', '-'],
      ],
    })
  })

  it('prints nothing at all, not even its heading, for an empty list', () => {
    expect(equipmentOf(invoiceSpec(withEquipmentOn(getDefaultInvoiceLayout()), NONE))).toBeNull()
    // The job works on nothing, though the vehicle has items.
    const jobOnly = withEquipmentOn(getDefaultInvoiceLayout(), { scope: 'job' })
    expect(equipmentOf(invoiceSpec(jobOnly, { job: [], vehicle: [CRANE] }))).toBeNull()
    expect(
      JSON.stringify(invoiceSpec(withEquipmentOn(getDefaultInvoiceLayout()), NONE))
    ).not.toContain('Equipment')
  })

  describe('in the document’s number and date format', () => {
    const originalTz = process.env.TZ
    afterEach(() => {
      process.env.TZ = originalTz
    })

    it.each([
      'Pacific/Kiritimati',
      'America/Los_Angeles',
    ])('prints each day as the day it is, on a server in %s', (zone) => {
      process.env.TZ = zone
      const spec = invoiceSpec(
        withEquipmentOn(getDefaultInvoiceLayout(), {
          fields: fieldsOn(['install_date', 'last_examined', 'next_examination', 'meters']),
        }),
        LISTS,
        { locale: 'nb-NO', invoiceSettings: { dateFormat: 'dd.MM.yyyy', timezone: zone } }
      )
      expect(equipmentOf(spec)?.rows[0]).toEqual([
        '03.06.2019',
        '10.02.2026',
        '10.02.2027',
        'Engine hours: 812,5\u00a0hrs',
      ])
    })
  })
})

describe('the designer’s sample', () => {
  const sample = (equipmentTypes?: string[]) =>
    buildSampleData(
      {
        name: 'Shop',
        address: '',
        phone: '',
        email: '',
        slogan: '',
        paymentTerms: '',
        logoUrl: '',
        equipmentTypes,
      } as never,
      [],
      ((key: string) => key) as never,
      {},
      'invoice'
    ).equipment

  it('lists two items under the workshop’s own names, and none for a workshop without', () => {
    expect(sample()).toBeUndefined()
    expect(sample([])).toBeUndefined()
    const items = sample(['Crane', 'Tail lift'])
    expect(items?.vehicle.map((row) => row.type)).toEqual(['Crane', 'Tail lift'])
    expect(items?.job.map((row) => row.type)).toEqual(['Crane'])
  })
})

describe('an issued invoice', () => {
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
    createdBy: { id: 'user-1', name: 'Kari' },
    ...over,
  })

  async function issue() {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
    const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
    return record({ issuedAt: new Date('2026-09-25T10:00:00Z'), issuedData })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
    db.vehicleFinding.findMany.mockResolvedValue([])
    db.documentDesign.findFirst.mockResolvedValue(null)
    db.appSetting.findMany.mockResolvedValue([])
    equipment.mockResolvedValue(LISTS)
  })

  it('reads both lists for this job and vehicle, and keeps them as issued', async () => {
    const issued = await issue()
    expect(equipment).toHaveBeenCalledWith('org-1', { jobId: 'rec-1', vehicleId: 'veh-1' })
    expect(issued.issuedData.equipment).toEqual(LISTS)

    // The tail lift comes off the vehicle after the invoice went out.
    equipment.mockResolvedValue({ job: [CRANE], vehicle: [CRANE] })
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.equipment).toEqual(LISTS)
  })

  it('issued before equipment was recorded prints none, and never borrows today’s', async () => {
    const issued = await issue()
    const { equipment: _frozen, ...before } = issued.issuedData
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, issuedData: before })

    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.issuedAt).toBeTruthy()
    expect(assembly?.data.equipment).toEqual(NONE)
    const spec = buildInvoicePrintSpec({
      data: assembly!.data,
      locale,
      template: { layoutConfig: withEquipmentOn(getDefaultInvoiceLayout()) } as never,
    })
    expect(equipmentOf(spec)).toBeNull()
  })

  it('freezes nothing for a job whose vehicle has no equipment', async () => {
    equipment.mockResolvedValue(NONE)
    expect((await issue()).issuedData.equipment).toBeNull()
  })
})
