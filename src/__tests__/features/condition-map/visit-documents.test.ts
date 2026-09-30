/**
 * The car's condition on the invoice and the quote: this visit's marks only,
 * printed last as an appendix, off until the design or the job asks for it,
 * and an issued invoice that keeps the marks it was sent with.
 */
import { describe, expect, it } from 'vitest'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'
import type { VisitConditionMap } from '@/features/condition-map/Lib/print'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import {
  freezeConditionMap,
  readIssuedInvoiceData,
  thawConditionMap,
} from '@/features/invoices/Lib/issuedInvoice'
import {
  getBuiltinFieldsForSection,
  getDefaultLayout,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
  id: 'm',
  vehicleId: 'v',
  inspectionId: null,
  inspectionItemId: null,
  serviceRecordId: 'svc_1',
  bodyType: 'estate',
  view: 'front',
  panel: 'front_bumper',
  x: 0.4,
  y: 0.7,
  kind: 'dent',
  severity: 'minor',
  note: 'Behind the plate',
  imageUrls: [],
  recordedAt: '2026-09-29T15:56:23.413Z',
  resolvedAt: null,
  ...over,
})

const map: VisitConditionMap = {
  bodyType: 'estate',
  marks: [
    mark({ id: 'a' }),
    mark({
      id: 'b',
      view: 'right',
      panel: 'right_front_door',
      kind: 'previous_repair',
      severity: 'major',
      note: null,
      recordedAt: '2026-09-29T15:56:25.783Z',
    }),
  ],
  labels: {
    views: { top: 'Top', left: 'Left side', right: 'Right side', front: 'Front', rear: 'Rear' },
    panels: { front_bumper: 'Front bumper', right_front_door: 'Right front door' },
    kinds: { dent: 'Dent', previous_repair: 'Previous repair' },
    severities: { minor: 'Minor', major: 'Major' },
    previous: 'recorded earlier',
  },
}

const invoice = {
  id: 'svc_1',
  title: 'Brakes',
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
  invoiceDate: new Date('2026-08-14'),
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  discountValue: 0,
  partItems: [],
  laborItems: [{ description: 'Fit', hours: 1, rate: 100, total: 100 }],
  customFields: [],
  findings: [],
  customer: { name: 'Alex' },
  vehicle: null,
} as unknown as InvoiceData

const quote = {
  id: 'quote-1',
  quoteNumber: 'QT-0001',
  title: 'Oil Change',
  description: null,
  status: 'sent',
  validUntil: null,
  createdAt: new Date('2026-08-14'),
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 100,
  notes: null,
  partItems: [],
  laborItems: [],
  customer: null,
  vehicle: null,
} as any

/** A design saved before the section existed: every section it knew, none of this one. */
function savedBeforeTheSection() {
  const layout = getDefaultLayout('invoice')
  return {
    ...layout,
    version: 3,
    sections: layout.sections.filter((s) => s.id !== 'condition_map'),
  }
}

const blockOf = (spec: any) => spec.blocks.find((b: any) => b.id === 'condition_map')
const legendOf = (spec: any) =>
  blockOf(spec)
    .content.children.find((c: any) => c.kind === 'table')
    .rows.map((r: any) => [r.area, r.kind, r.severity, r.note])

describe('the Vehicle Condition section on an invoice and a quote', () => {
  it('is off in a new design, last before the signature', () => {
    const layout = getDefaultLayout('invoice')
    const ids = layout.sections.map((s) => s.id)
    expect(ids.indexOf('condition_map')).toBe(ids.indexOf('signature') - 1)
    expect(layout.sections.find((s) => s.id === 'condition_map')?.visible).toBe(false)
  })

  it('arrives off in a design saved before it existed, in the same place', () => {
    const merged = mergeWithDefaults(savedBeforeTheSection())
    const section = merged.sections.find((s) => s.id === 'condition_map')
    expect(section?.visible).toBe(false)
    const ids = merged.sections.map((s) => s.id)
    expect(ids.indexOf('condition_map')).toBe(ids.indexOf('bank_account') + 1)
  })

  it('goes in front of the signing line wherever a design put it', () => {
    // Bank details under the signature, as some workshops arrange it: the
    // appendix still ends up before the signature, not after it.
    const layout = savedBeforeTheSection()
    const order = [
      'header',
      'document_title',
      'customer',
      'vehicle',
      'items_table',
      'totals',
      'signature',
      'bank_account',
      'footer',
    ]
    const rearranged = {
      ...layout,
      sections: order.map((id, i) => ({
        ...layout.sections.find((s) => s.id === id)!,
        order: i,
        visible: true,
      })),
    }
    const ids = mergeWithDefaults(rearranged).sections.map((s) => s.id)
    expect(ids.indexOf('condition_map')).toBe(ids.indexOf('signature') - 1)
    expect(ids.indexOf('condition_map')).toBeGreaterThan(ids.indexOf('totals'))
  })

  it('keeps the choice a workshop saved', () => {
    const layout = getDefaultLayout('invoice')
    const on = {
      ...layout,
      version: 3,
      sections: layout.sections.map((s) =>
        s.id === 'condition_map' ? { ...s, visible: true } : s
      ),
    }
    expect(mergeWithDefaults(on).sections.find((s) => s.id === 'condition_map')?.visible).toBe(true)
  })

  it('leaves the work order and the certificate as they were', () => {
    for (const type of ['work_order', 'certificate'] as const) {
      const layout = getDefaultLayout(type)
      const saved = { ...layout, sections: layout.sections.filter((s) => s.id !== 'condition_map') }
      expect(mergeWithDefaults(saved).sections.find((s) => s.id === 'condition_map')?.visible).toBe(
        true
      )
      expect(getBuiltinFieldsForSection('condition_map', type).map((f) => f.id)).toContain(
        'previous_marks'
      )
    }
  })

  it('offers no switch for earlier visits, which an invoice never prints', () => {
    for (const type of ['invoice', 'quote'] as const) {
      expect(getBuiltinFieldsForSection('condition_map', type).map((f) => f.id)).toEqual(['legend'])
      const section = getDefaultLayout(type).sections.find((s) => s.id === 'condition_map')
      expect(section?.fields?.map((f) => f.id)).toEqual(['legend'])
    }
  })
})

describe('the printed invoice', () => {
  const print = (layout: any, conditionMap?: VisitConditionMap) =>
    buildInvoicePrintSpec({
      data: invoice,
      template: { layoutConfig: layout } as any,
      conditionMap,
    }) as any

  const withSection = () => {
    const layout = getDefaultLayout('invoice')
    return {
      ...layout,
      version: 3,
      sections: layout.sections.map((s) =>
        s.id === 'condition_map' ? { ...s, visible: true } : s
      ),
    }
  }

  it("draws this visit's marks with their legend, none of them greyed", () => {
    const spec = print(withSection(), map)
    const block = blockOf(spec)
    expect(block.content.children.some((c: any) => c.kind === 'drawing')).toBe(true)
    expect(legendOf(spec)).toEqual([
      ['Front bumper', 'Dent', 'Minor', 'Behind the plate'],
      ['Right front door', 'Previous repair', 'Major', ''],
    ])
  })

  it('prints nothing for a visit with no marks, or with the section off', () => {
    expect(blockOf(print(withSection()))).toBeUndefined()
    expect(blockOf(print({ ...getDefaultLayout('invoice'), version: 3 }, map))).toBeUndefined()
  })

  it('prints the map when the job asked for it, whatever the design says', () => {
    // The switch on the drop-off tab: this invoice, without touching the design.
    const spec = print({ ...getDefaultLayout('invoice'), version: 3 }, { ...map, onInvoice: true })
    expect(legendOf(spec)).toHaveLength(2)
    // Asked for on a job with nothing to show is still nothing.
    expect(
      blockOf(
        print(
          { ...getDefaultLayout('invoice'), version: 3 },
          { ...map, marks: [], onInvoice: true }
        )
      )
    ).toBeUndefined()
    // Declined on the job, the map stays off even where the design has it on.
    expect(blockOf(print(withSection(), { ...map, onInvoice: false }))).toBeUndefined()
    // Neither asked nor declined: the design decides.
    expect(legendOf(print(withSection(), { ...map, onInvoice: null }))).toHaveLength(2)
  })
})

describe('the printed quote', () => {
  it('draws the marks of the inspection it came from', () => {
    const layout = getDefaultLayout('quote')
    const on = {
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === 'condition_map' ? { ...s, visible: true } : s
      ),
    }
    const spec = buildQuotePrintSpec({ data: quote, layoutConfig: on, conditionMap: map }) as any
    expect(legendOf(spec).map((row: string[]) => row[0])).toEqual([
      'Front bumper',
      'Right front door',
    ])
    expect(blockOf(buildQuotePrintSpec({ data: quote, layoutConfig: on }))).toBeUndefined()
    // Off by default: the inspection's marks wait for the design to ask.
    expect(
      blockOf(buildQuotePrintSpec({ data: quote, layoutConfig: layout, conditionMap: map }))
    ).toBeUndefined()
  })
})

describe('an issued invoice', () => {
  it('keeps the marks it was issued with, through the stored JSON', () => {
    const frozen = freezeConditionMap({ ...map, onInvoice: true })
    const stored = JSON.parse(
      JSON.stringify({ version: 1, workshop: {}, invoiceSettings: {}, conditionMap: frozen })
    )
    const read = readIssuedInvoiceData(stored)
    const thawed = thawConditionMap(read?.conditionMap)
    expect(thawed?.bodyType).toBe('estate')
    // The job's own ask travels with the snapshot, so the design cannot
    // take the map off an invoice that went out with it.
    expect(thawed?.onInvoice).toBe(true)
    expect(thawed?.marks.map((m) => [m.id, m.panel, m.kind, m.severity, m.note])).toEqual([
      ['a', 'front_bumper', 'dent', 'minor', 'Behind the plate'],
      ['b', 'right_front_door', 'previous_repair', 'major', null],
    ])
    // Printed from the snapshot, it says what the invoice said when it went out.
    const spec = buildInvoicePrintSpec({
      data: invoice,
      template: { layoutConfig: { ...getDefaultLayout('invoice'), version: 3 } } as any,
      conditionMap: { ...thawed!, labels: map.labels },
    }) as any
    expect(legendOf(spec)).toHaveLength(2)
  })

  it('prints none when it was issued before the invoice printed the map', () => {
    const read = readIssuedInvoiceData({ version: 1, workshop: {}, invoiceSettings: {} })
    expect(read).not.toBeNull()
    expect(thawConditionMap(read?.conditionMap)).toBeNull()
    expect(freezeConditionMap(null)).toBeNull()
    expect(freezeConditionMap({ bodyType: 'sedan', marks: [], onInvoice: true })).toBeNull()
    // A job that never answered stays that way through the snapshot.
    const undecided = freezeConditionMap({ ...map, onInvoice: null })
    expect(thawConditionMap(undecided)?.onInvoice).toBeNull()
  })
})
