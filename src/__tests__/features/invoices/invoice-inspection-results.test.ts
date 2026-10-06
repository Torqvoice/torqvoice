// @vitest-environment node
/**
 * The inspection's results on an invoice, draft and issued.
 *
 * A draft prints the inspection linked to its job as it stands. Issuing
 * freezes the checks beside everything else the invoice says, so grading,
 * renaming or deleting a check afterwards cannot rewrite paper a customer
 * holds. An invoice issued without results has none, and never borrows
 * today's; and one issued before the field existed still reads as it did.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
  inspection: { findFirst: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
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
// A stored photograph decodes to a picture named after its file; one whose
// file has gone decodes to nothing, as the real loader leaves it out.
const loadInspectionPhotos = vi.fn(async (items: { id: string; imageUrls: string[] }[]) => ({
  photos: Object.fromEntries(
    items
      .map((i) => [
        i.id,
        i.imageUrls.filter((u) => !u.includes('gone')).map((u) => ({ dataUri: `data:${u}` })),
      ])
      .filter(([, photos]) => (photos as unknown[]).length > 0)
  ),
  omitted: 0,
}))
vi.mock('@/features/inspections/Lib/inspectionPhotos', () => ({
  loadInspectionPhotos: (items: { id: string; imageUrls: string[] }[]) =>
    loadInspectionPhotos(items),
}))

const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData } = await import('@/features/invoices/Lib/issueInvoice')
const { freezeInspectionResults, readIssuedInvoiceData, thawInspectionResults } = await import(
  '@/features/invoices/Lib/issuedInvoice'
)
const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')
const { DESIGNER_LAYOUT_VERSION, getDefaultLayout } = await import(
  '@/features/settings/Schema/invoiceLayoutSchema'
)

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where two photographs of a defect are stored; the second file has since gone. */
const HOSE = '/api/protected/files/org-1/services/hose.jpg'
const GONE = '/api/protected/files/org-1/services/gone.jpg'

/** The invoice design with the two result sections switched on or left off. */
function design(on: boolean, switches: Record<string, boolean> = {}) {
  const layout = getDefaultLayout('invoice')
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((s) =>
      s.id === 'defects' || s.id === 'results_table'
        ? {
            ...s,
            visible: on,
            fields: s.fields?.map((f) => ({ ...f, visible: switches[f.id] ?? f.visible })),
          }
        : s
    ),
  }
}

const item = (id: string, name: string, condition: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  section: 'Brakes',
  sectionCode: '1',
  code: null,
  condition,
  notes: null,
  sortOrder: Number(id.slice(1)),
  measuredValue: null,
  unit: null,
  textValue: null,
  inputType: 'condition',
  imageUrls: [] as string[],
  ...over,
})

/** The inspection as the job's technician left it when the invoice went out. */
const inspectionAtIssue = () => ({
  severityScale: 'eu',
  country: null,
  template: { severityScale: 'eu', country: null },
  items: [
    item('i1', 'Brake pedal', 'pass', {
      imageUrls: ['/api/protected/files/org-1/services/pedal.jpg'],
    }),
    item('i2', 'Brake hoses', 'fail', {
      notes: 'Cracked at the front left',
      imageUrls: [HOSE, GONE],
    }),
    item('i3', 'Brake fluid', 'not_inspected'),
  ],
})

/** The same inspection after somebody went back to it. */
const inspectionToday = () => ({
  ...inspectionAtIssue(),
  items: [
    item('i1', 'Brake pedal', 'dangerous', { notes: 'Snapped off' }),
    item('i2', 'Brake hoses (renamed)', 'pass'),
    item('i9', 'Horn', 'fail'),
  ],
})

const record = (over: Record<string, unknown> = {}) => ({
  id: 'rec-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  inspectionId: 'insp-1',
  designId: null,
  title: 'Brakes',
  type: 'repair',
  serviceDate: new Date('2026-09-24T09:00:00Z'),
  invoiceNumber: '2026-0042',
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
  laborItems: [{ description: 'Replace hoses', hours: 1, rate: 100, total: 100 }],
  attachments: [],
  payments: [],
  technician: null,
  customer: { name: 'Alex Carter', invoiceDesignId: null },
  vehicle: {
    customerId: 'cust-1',
    make: 'Volvo',
    model: 'V60',
    year: 2020,
    vin: null,
    licensePlate: 'AB 12345',
    hsn: null,
    tsn: null,
    mileage: 84120,
    customer: null,
  },
  issuedDesignSnapshot: null,
  issuedLogoSnapshot: null,
  issuedSignatureSnapshot: null,
  createdBy: { id: 'user-1', name: 'Kari' },
  ...over,
})

/** The workshop's settings with this layout as its invoice design. */
const settingsWith = (layout: unknown) => [
  { key: 'invoice.layoutConfig', value: JSON.stringify(layout) },
]

const printed = (assembly: any) =>
  (
    buildInvoicePrintSpec({
      data: assembly.data,
      template: assembly.template,
      inspectionResults: assembly.inspectionResults,
    }) as any
  ).blocks

const blockText = (assembly: any, id: string) =>
  JSON.stringify(printed(assembly).find((b: any) => b.id === id)?.content ?? null)

/** Issues the invoice as it prints now, and returns the record that leaves behind. */
async function issue(layout: unknown) {
  db.serviceRecord.findUnique.mockResolvedValue(record())
  db.appSetting.findMany.mockResolvedValue(settingsWith(layout))
  db.inspection.findFirst.mockResolvedValue(inspectionAtIssue())
  const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
  // Through JSON, as the column stores it.
  const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
  return record({
    issuedAt: new Date('2026-09-25T10:00:00Z'),
    issuedData,
    issuedDesignSnapshot: { layout, template: {} },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
  db.vehicleFinding.findMany.mockResolvedValue([])
  db.documentDesign.findFirst.mockResolvedValue(null)
  db.appSetting.findMany.mockResolvedValue([])
})

describe('a draft invoice', () => {
  it('prints the linked inspection as it stands, scoped to the workshop and the vehicle', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    db.appSetting.findMany.mockResolvedValue(settingsWith(design(true)))
    db.inspection.findFirst.mockResolvedValue(inspectionAtIssue())

    const assembly = await assembleInvoicePrint('rec-1')
    expect(db.inspection.findFirst.mock.calls[0][0].where).toEqual({
      id: 'insp-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
    })
    expect(assembly?.inspectionResults?.items.map((i) => i.name)).toEqual([
      'Brake pedal',
      'Brake hoses',
      'Brake fluid',
    ])
    expect(blockText(assembly, 'defects')).toContain('Brake hoses')
    // The defect's photographs, and only the defect's; the lost file left out.
    expect(assembly?.inspectionResults?.itemPhotos).toEqual({
      i2: [{ dataUri: `data:${HOSE}` }],
    })
  })

  it('does not read the inspection for a design that prints neither section', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    db.appSetting.findMany.mockResolvedValue(settingsWith(design(false)))
    const assembly = await assembleInvoicePrint('rec-1')
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
    expect(assembly?.inspectionResults).toBeNull()
    // Nor for a workshop that never opened the designer.
    db.appSetting.findMany.mockResolvedValue([])
    await assembleInvoicePrint('rec-1')
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
  })

  it('leaves the inspection to the work order when it prints from the same job', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    db.appSetting.findMany.mockResolvedValue(settingsWith(design(true)))
    const assembly = await assembleInvoicePrint('rec-1', {
      mode: 'live',
      inspectionResults: 'none',
    })
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
    expect(assembly?.inspectionResults).toBeNull()
  })
})

describe('issuing an invoice', () => {
  it('freezes every check, with where the defects photographs are and no picture', async () => {
    const issued = await issue(design(true))
    const frozen = (issued.issuedData as any).inspectionResults
    expect(frozen.items.map((i: any) => [i.name, i.condition])).toEqual([
      ['Brake pedal', 'pass'],
      ['Brake hoses', 'fail'],
      // Ungraded too: a design may print the whole checklist.
      ['Brake fluid', 'not_inspected'],
    ])
    expect(frozen.items.map((i: any) => i.imageUrls)).toEqual([undefined, [HOSE, GONE], undefined])
    // Issuing decodes no photograph, and none is written into the snapshot.
    expect(loadInspectionPhotos).not.toHaveBeenCalled()
    expect(JSON.stringify(issued.issuedData)).not.toContain('data:')
  })

  it('freezes nothing for a design that prints neither section', async () => {
    const issued = await issue(design(false))
    expect((issued.issuedData as any).inspectionResults).toBeNull()
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
  })
})

describe('an issued invoice', () => {
  it('prints the results as they were when issued, whatever the inspection says now', async () => {
    const issued = await issue(design(true))
    vi.clearAllMocks()
    db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
    db.appSetting.findMany.mockResolvedValue(settingsWith(design(true)))
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    db.inspection.findFirst.mockResolvedValue(inspectionToday())

    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.issuedAt).toEqual(issued.issuedAt)
    // Today's inspection is never asked.
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
    expect(assembly?.inspectionResults?.items.map((i) => [i.name, i.condition])).toEqual([
      ['Brake pedal', 'pass'],
      ['Brake hoses', 'fail'],
      ['Brake fluid', 'not_inspected'],
    ])
    const defects = blockText(assembly, 'defects')
    expect(defects).toContain('Brake hoses')
    expect(defects).toContain('Cracked at the front left')
    expect(defects).not.toContain('Snapped off')
    expect(defects).not.toContain('renamed')
    expect(defects).not.toContain('Horn')
    // The photographs are read again from where they were, the lost one skipped.
    expect(defects).toContain(`data:${HOSE}`)
    expect(defects).not.toContain('gone')
    expect(loadInspectionPhotos.mock.calls[0][0].map((i) => i.id)).toEqual(['i2'])
  })

  it('reads a frozen photograph only from the uploads of this workshop', async () => {
    // A snapshot is stored data: one that names another workshop's file, or
    // a path that is no upload at all, gets no picture.
    const issued = await issue(design(true))
    const theirs = '/api/protected/files/org-2/services/secret.jpg'
    const items = (issued.issuedData as any).inspectionResults.items
    items[1].imageUrls = [theirs, '/etc/passwd', '../../org-2/services/secret.jpg', HOSE]
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    loadInspectionPhotos.mockClear()
    const defects = blockText(await assembleInvoicePrint('rec-1'), 'defects')
    expect(loadInspectionPhotos.mock.calls[0][0][0].imageUrls).toEqual([HOSE])
    expect(defects).toContain(`data:${HOSE}`)
    expect(defects).not.toContain('org-2')
  })

  it('prints the frozen checklist, ungraded checks and all, for a design that lists them', async () => {
    const layout = design(true, { ungraded_checks: true, passed_checks: true })
    const issued = await issue(layout)
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    db.inspection.findFirst.mockResolvedValue(inspectionToday())
    const table = blockText(await assembleInvoicePrint('rec-1'), 'results_table')
    expect(table).toContain('Brake pedal')
    expect(table).toContain('Brake fluid')
    expect(table).not.toContain('Horn')
  })

  it('prints none when it was issued without results, and never borrows the ones of today', async () => {
    // Issued by a design that printed neither section, or before the invoice
    // could print them at all; then given a design that does.
    for (const issuedData of [
      (await issue(design(false))).issuedData,
      { version: 1, workshop: { name: 'Shop', address: '', phone: '', email: '' } },
    ]) {
      vi.clearAllMocks()
      db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
      db.appSetting.findMany.mockResolvedValue(settingsWith(design(true)))
      db.inspection.findFirst.mockResolvedValue(inspectionToday())
      db.serviceRecord.findUnique.mockResolvedValue(
        record({
          issuedAt: new Date('2026-09-25T10:00:00Z'),
          issuedData,
          issuedDesignSnapshot: { layout: design(true), template: {} },
        })
      )
      const assembly = await assembleInvoicePrint('rec-1')
      expect(assembly?.issuedAt).not.toBeNull()
      expect(assembly?.inspectionResults).toBeNull()
      expect(db.inspection.findFirst).not.toHaveBeenCalled()
      const ids = printed(assembly).map((b: any) => b.id)
      expect(ids).not.toContain('defects')
      expect(ids).not.toContain('results_table')
    }
  })

  it('prints live again while an owner has it reopened', async () => {
    const issued = await issue(design(true))
    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      editUnlockedAt: new Date('2026-09-26T10:00:00Z'),
    })
    db.inspection.findFirst.mockResolvedValue(inspectionToday())
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.issuedAt).toBeNull()
    expect(blockText(assembly, 'defects')).toContain('Snapped off')
  })
})

describe('the issued data', () => {
  const OLD = {
    version: 1,
    workshop: { name: 'Shop', address: 'Road 1', phone: '555', email: 's@x.no' },
    invoiceSettings: { bankAccount: '1234', dueDays: 14 },
    serviceType: 'automotive',
    customer: { name: 'Alex Carter', address: 'Old street 1' },
    vehicle: { make: 'Volvo', model: 'V60', year: 2020 },
    technicianName: 'Kari',
    findings: [{ description: 'Worn pads', severity: 'monitor' }],
    customFields: [],
    conditionMap: null,
  }

  it('still reads a snapshot written before the results were kept, word for word', () => {
    const read = readIssuedInvoiceData(JSON.parse(JSON.stringify(OLD)))
    expect(read).toEqual(OLD)
    expect(read?.inspectionResults).toBeUndefined()
    expect(thawInspectionResults(read?.inspectionResults)).toBeNull()
  })

  it('reads back what it froze', () => {
    const results = {
      severityScale: 'basic' as const,
      country: 'NO',
      items: inspectionAtIssue().items,
    }
    const stored = JSON.parse(
      JSON.stringify({ ...OLD, inspectionResults: freezeInspectionResults(results) })
    )
    const thawed = thawInspectionResults(readIssuedInvoiceData(stored)?.inspectionResults)
    expect(thawed?.severityScale).toBe('basic')
    expect(thawed?.country).toBe('NO')
    expect(thawed?.items.map((i) => [i.id, i.condition, i.notes, i.imageUrls])).toEqual([
      ['i1', 'pass', null, []],
      ['i2', 'fail', 'Cracked at the front left', [HOSE, GONE]],
      ['i3', 'not_inspected', null, []],
    ])
    expect(freezeInspectionResults(null)).toBeNull()
    expect(freezeInspectionResults({ severityScale: 'eu', country: null, items: [] })).toBeNull()
  })

  it('loses only the results, not the invoice, when the results cannot be read', () => {
    // Anything else unreadable means the snapshot is not trusted and the
    // invoice prints from live rows; a bad results block must not do that.
    const read = readIssuedInvoiceData({ ...OLD, inspectionResults: { items: 'not a list' } })
    expect(read).not.toBeNull()
    expect(read?.customer?.address).toBe('Old street 1')
    expect(read?.inspectionResults).toBeNull()
  })
})
