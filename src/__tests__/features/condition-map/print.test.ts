/**
 * The condition map as the documents draw it: every body has its five
 * views on the sheet, a mark lands on the panel it was tapped on and comes
 * back to the same spot, the legend numbers this sheet's marks after the
 * earlier ones, and a car with no marks draws nothing.
 */
import { describe, expect, it } from 'vitest'
import { BODY_DRAWINGS, getBodyDrawing } from '@/features/condition-map/Drawings'
import {
  composeViews,
  locateOnSheet,
  markPosition,
  placedPanels,
} from '@/features/condition-map/Lib/compose'
import { BODY_TYPES, PANELS, VIEWS, mirrorPanel } from '@/features/condition-map/Lib/drawingTypes'
import { conditionMapForPrint } from '@/features/condition-map/Lib/print'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'
import { buildCertificatePrintSpec } from '@/features/inspections/Pdf/buildCertificatePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { getDefaultLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const PATH = /^M[\d.\s,MLCQAZHV-]+$/i

describe('the body drawings', () => {
  it.each(BODY_TYPES)('%s has its four drawn views with known, unrepeated panels', (body) => {
    const drawing = getBodyDrawing(body)
    expect(BODY_DRAWINGS[body]).toBe(drawing)
    for (const view of ['top', 'left', 'front', 'rear'] as const) {
      const drawn = drawing.views[view]
      expect(drawn.panels.length).toBeGreaterThan(0)
      const ids = drawn.panels.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const panel of drawn.panels) {
        expect(PANELS).toContain(panel.id)
        expect(panel.d.trim()).toMatch(PATH)
      }
      for (const line of drawn.lines) expect(line.trim()).toMatch(PATH)
    }
  })

  it('places every view on the sheet, the right side mirrored from the left', () => {
    const composition = composeViews()
    expect(composition.views.map((v) => v.view).sort()).toEqual([...VIEWS].sort())
    const placed = placedPanels(getBodyDrawing('sedan'), composition)
    const left = placed.filter((p) => p.view === 'left').map((p) => p.panel)
    const right = placed.filter((p) => p.view === 'right').map((p) => p.panel)
    expect(right.sort()).toEqual(left.map(mirrorPanel).sort())
  })

  it('takes a mark to the sheet and back to the same place in its view', () => {
    const composition = composeViews()
    for (const view of VIEWS) {
      const at = markPosition(composition, { view, x: 0.37, y: 0.61 })
      expect(at).not.toBeNull()
      const back = locateOnSheet(composition, at![0], at![1])
      expect(back?.view).toBe(view)
      expect(back?.x).toBeCloseTo(0.37, 3)
      expect(back?.y).toBeCloseTo(0.61, 3)
    }
  })
})

const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
  id: 'm',
  vehicleId: 'v',
  inspectionId: null,
  inspectionItemId: null,
  serviceRecordId: null,
  bodyType: 'sedan',
  view: 'left',
  panel: 'left_front_door',
  x: 0.5,
  y: 0.5,
  kind: 'dent',
  severity: 'minor',
  note: null,
  imageUrls: [],
  recordedAt: '2026-09-01T00:00:00Z',
  resolvedAt: null,
  ...over,
})

const labels = {
  views: { top: 'Top', left: 'Left', right: 'Right', front: 'Front', rear: 'Rear' },
  panels: { left_front_door: 'Left front door', rear_bumper: 'Rear bumper' },
  kinds: { dent: 'Dent', scratch: 'Scratch' },
  severities: { minor: 'Minor', major: 'Major' },
  previous: 'earlier',
}

describe('the printed condition map', () => {
  it('draws nothing for a car with no open marks', () => {
    expect(
      conditionMapForPrint({
        bodyType: 'sedan',
        marks: [],
        includePrevious: true,
        labels,
        width: 500,
      })
    ).toBeNull()
    const resolved = mark({ resolvedAt: '2026-09-02T00:00:00Z' })
    expect(
      conditionMapForPrint({
        bodyType: 'sedan',
        marks: [resolved],
        includePrevious: true,
        labels,
        width: 500,
      })
    ).toBeNull()
  })

  it('numbers earlier marks first, greys them, and can leave them out', () => {
    const marks = [
      mark({ id: 'new', inspectionItemId: 'c1', recordedAt: '2026-09-05T00:00:00Z' }),
      mark({
        id: 'old',
        serviceRecordId: 's0',
        panel: 'rear_bumper',
        view: 'rear',
        kind: 'scratch',
        recordedAt: '2026-01-01T00:00:00Z',
      }),
    ]
    const withOld = conditionMapForPrint({
      bodyType: 'sedan',
      marks,
      scope: { inspectionId: 'i', inspectionItemId: 'c1' },
      includePrevious: true,
      labels,
      width: 500,
    })!
    expect(withOld.rows.map((r) => [r.n, r.area, r.kind, r.previous])).toEqual([
      ['1', 'Rear bumper (earlier)', 'Scratch', true],
      ['2', 'Left front door', 'Dent', false],
    ])
    expect(withOld.ownCount).toBe(1)
    expect(withOld.height).toBeGreaterThan(0)
    expect(withOld.shapes.some((s) => s.type === 'text' && s.text === '2')).toBe(true)
    const without = conditionMapForPrint({
      bodyType: 'sedan',
      marks,
      scope: { inspectionId: 'i', inspectionItemId: 'c1' },
      includePrevious: false,
      labels,
      width: 500,
    })!
    expect(without.rows.map((r) => r.n)).toEqual(['1'])
  })

  it('can insist on a mark of its own before it draws anything', () => {
    const earlier = mark({ id: 'old', serviceRecordId: 's0' })
    const own = mark({ id: 'new', serviceRecordId: 's1', panel: 'rear_bumper', view: 'rear' })
    const scope = { serviceRecordId: 's1' }
    expect(
      conditionMapForPrint({
        bodyType: 'sedan',
        marks: [earlier],
        scope,
        requireOwn: true,
        includePrevious: true,
        labels,
        width: 500,
      })
    ).toBeNull()
    const withOwn = conditionMapForPrint({
      bodyType: 'sedan',
      marks: [earlier, own],
      scope,
      requireOwn: true,
      includePrevious: true,
      labels,
      width: 500,
    })!
    expect(withOwn.rows.map((r) => r.previous)).toEqual([true, false])
  })
})

function ids(spec: any): string[] {
  return spec.blocks.map((b: any) => b.id)
}

describe('the documents', () => {
  const certificate = (over: Record<string, unknown> = {}) =>
    buildCertificatePrintSpec({
      data: {
        id: 'insp1',
        status: 'completed',
        mileage: 1,
        notes: null,
        createdAt: new Date('2026-09-24T09:00:00Z'),
        completedAt: new Date('2026-09-24T10:00:00Z'),
        severityScale: 'basic',
        country: null,
        vehicleCategory: null,
        nextTestDue: null,
        certificateNumber: null,
        inspectorName: null,
        testLocation: null,
        template: { name: 'Intake', severityScale: 'basic', country: null },
        vehicle: {
          make: 'Volvo',
          model: 'V60',
          year: 2020,
          vin: null,
          licensePlate: 'AB 1',
          mileage: 1,
          customer: null,
        },
        items: [
          {
            id: 'map',
            name: 'Body condition',
            section: 'Exterior',
            condition: 'pass',
            notes: null,
            sortOrder: 0,
            inputType: 'condition_map',
          },
        ],
      } as any,
      layoutConfig: getDefaultLayout('certificate'),
      conditionMarks: [mark({ inspectionId: 'insp1', inspectionItemId: 'map' })],
      bodyType: 'sedan',
      conditionMapLabels: labels,
      ...over,
    }) as any

  it('puts the condition map on the certificate, with its legend', () => {
    const spec = certificate()
    expect(ids(spec)).toContain('condition_map')
    const block = spec.blocks.find((b: any) => b.id === 'condition_map').content
    // The heading is drawn on the sheet, so a page break never leaves it behind.
    const drawing = block.children.find((c: any) => c.kind === 'drawing')
    expect(drawing.viewBoxY).toBeLessThan(0)
    expect(drawing.shapes[0]).toMatchObject({ type: 'text', text: 'VEHICLE CONDITION' })
    expect(block.children.some((c: any) => c.kind === 'text')).toBe(false)
    expect(block.children.some((c: any) => c.kind === 'table')).toBe(true)
    expect(ids(certificate({ conditionMarks: [] }))).not.toContain('condition_map')
  })

  it("puts every open mark on the work order, this job's in colour", () => {
    const spec = buildWorkOrderPrintSpec({
      data: {
        id: 'job1',
        title: 'Job',
        type: 'repair',
        serviceDate: new Date('2026-09-24T09:00:00Z'),
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        cost: 0,
        invoiceNumber: '1',
        partItems: [],
        laborItems: [],
        customer: { name: 'A' },
        vehicle: {
          make: 'Volvo',
          model: 'V60',
          year: 2020,
          vin: null,
          licensePlate: 'AB 1',
          mileage: 1,
          customer: null,
        },
      } as unknown as InvoiceData,
      job: {
        orderNumber: '1',
        statusLabel: 'Open',
        concerns: [],
        printedAt: new Date('2026-09-25T00:00:00Z'),
        conditionMarks: [
          mark({ id: 'own', serviceRecordId: 'job1' }),
          mark({
            id: 'earlier',
            inspectionId: 'x',
            inspectionItemId: 'y',
            panel: 'rear_bumper',
            view: 'rear',
          }),
        ],
        bodyType: 'sedan',
        conditionMapLabels: labels,
      },
      labels: {},
    }) as any
    expect(ids(spec)).toContain('condition_map')
    const table = spec.blocks
      .find((b: any) => b.id === 'condition_map')
      .content.children.find((c: any) => c.kind === 'table')
    // Recorded at the same moment, the earlier visit's mark is listed first, as such.
    expect(table.rows.map((r: any) => r.area)).toEqual(['Rear bumper (earlier)', 'Left front door'])
  })

  it('leaves the map off a work order whose own drop-off recorded nothing', () => {
    // The check-in inspection's marks are the inspection's report, not this job's.
    const spec = buildWorkOrderPrintSpec({
      data: {
        id: 'job1',
        title: 'Job',
        type: 'repair',
        serviceDate: new Date('2026-09-24T09:00:00Z'),
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        cost: 0,
        invoiceNumber: '1',
        partItems: [],
        laborItems: [],
        customer: { name: 'A' },
        vehicle: {
          make: 'Volvo',
          model: 'V60',
          year: 2020,
          vin: null,
          licensePlate: 'AB 1',
          mileage: 1,
          customer: null,
        },
      } as unknown as InvoiceData,
      job: {
        orderNumber: '1',
        statusLabel: 'Open',
        concerns: [],
        printedAt: new Date('2026-09-25T00:00:00Z'),
        conditionMarks: [mark({ id: 'checkin', inspectionId: 'x', inspectionItemId: 'y' })],
        bodyType: 'sedan',
        conditionMapLabels: labels,
      },
      labels: {},
    }) as any
    expect(ids(spec)).not.toContain('condition_map')
  })
})

describe("this visit's marks", () => {
  const jobData = {
    id: 'job1',
    title: 'Job',
    type: 'repair',
    serviceDate: new Date('2026-09-24T09:00:00Z'),
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 0,
    cost: 0,
    invoiceNumber: '1',
    partItems: [],
    laborItems: [],
    customer: { name: 'A' },
    vehicle: {
      make: 'Volvo',
      model: 'V60',
      year: 2020,
      vin: null,
      licensePlate: 'AB 1',
      mileage: 1,
      customer: null,
    },
  } as unknown as InvoiceData
  const workOrder = (marks: ConditionMarkData[], linkedInspectionId: string | null) =>
    buildWorkOrderPrintSpec({
      data: jobData,
      job: {
        orderNumber: '1',
        statusLabel: 'Open',
        concerns: [],
        printedAt: new Date('2026-09-25T00:00:00Z'),
        conditionMarks: marks,
        linkedInspectionId,
        bodyType: 'sedan',
        conditionMapLabels: labels,
      },
      labels: {},
    }) as any
  const legend = (spec: any) =>
    spec.blocks
      .find((b: any) => b.id === 'condition_map')
      .content.children.find((c: any) => c.kind === 'table')
      .rows.map((r: any) => r.area)

  it("prints the linked check-in inspection's marks on the work order as the job's own", () => {
    const checkin = mark({ id: 'checkin', inspectionId: 'insp1', inspectionItemId: 'c1' })
    const older = mark({
      id: 'older',
      inspectionId: 'insp0',
      inspectionItemId: 'c0',
      panel: 'rear_bumper',
      view: 'rear',
      recordedAt: '2026-01-01T00:00:00Z',
    })
    expect(legend(workOrder([older, checkin], 'insp1'))).toEqual([
      'Rear bumper (earlier)',
      'Left front door',
    ])
    // Not linked, the same check-in is somebody else's report.
    expect(ids(workOrder([older, checkin], null))).not.toContain('condition_map')
  })

  it('lists a mark drawn on another body type without placing it on this drawing', () => {
    const onSedan = mark({ id: 'sedan', serviceRecordId: 's1' })
    const onEstate = mark({
      id: 'estate',
      serviceRecordId: 's1',
      bodyType: 'estate',
      panel: 'rear_bumper',
      view: 'rear',
      recordedAt: '2026-09-02T00:00:00Z',
    })
    const map = conditionMapForPrint({
      bodyType: 'sedan',
      marks: [onSedan, onEstate],
      scope: { serviceRecordId: 's1' },
      includePrevious: true,
      labels,
      width: 500,
    })!
    expect(map.rows.map((r) => r.area)).toEqual(['Left front door', 'Rear bumper'])
    const numbers = map.shapes.filter((s) => s.type === 'text').map((s: any) => s.text)
    expect(numbers).toContain('1')
    expect(numbers).not.toContain('2')
  })
})

describe('the drawing sized by the design', () => {
  const marks = [mark({ id: 'a', serviceRecordId: 's1' })]
  const invoiceWith = (section: Record<string, unknown>) => {
    const layout = getDefaultLayout('invoice')
    return {
      ...layout,
      version: 3,
      sections: layout.sections.map((s) =>
        s.id === 'condition_map' ? { ...s, visible: true, ...section } : s
      ),
    }
  }
  const full = conditionMapForPrint({
    bodyType: 'sedan',
    marks,
    includePrevious: false,
    labels,
    width: 515,
  })!
  const drawingOf = (spec: any) => {
    const block = spec.blocks.find((b: any) => b.id === 'condition_map').content
    const first = block.children[0]
    return first.kind === 'row'
      ? { row: first, drawing: first.children[0].node }
      : { drawing: first }
  }
  const print = (section: Record<string, unknown>) =>
    buildInvoicePrintSpec({
      data: {
        id: 's1',
        title: 'Job',
        type: 'repair',
        serviceDate: new Date('2026-08-14'),
        invoiceDate: new Date('2026-08-14'),
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        cost: 0,
        invoiceNumber: 'INV-1',
        discountValue: 0,
        partItems: [],
        laborItems: [],
        customFields: [],
        findings: [],
        customer: { name: 'A' },
        vehicle: null,
      } as any,
      template: { layoutConfig: invoiceWith(section) } as any,
      conditionMap: { marks, bodyType: 'sedan', labels },
    }) as any

  it('spans the row with every view unless the design says otherwise', () => {
    const { row, drawing } = drawingOf(print({}))
    expect(row).toBeUndefined()
    expect(drawing.width).toBe(full.width)
    expect(drawing.shapes.filter((s: any) => s.type === 'text').map((s: any) => s.text)).toEqual(
      expect.arrayContaining(['Top', 'Left', 'Right', 'Front', 'Rear'])
    )
  })

  it('draws narrower where the design sets a width, placed by its alignment', () => {
    const { row, drawing } = drawingOf(print({ style: { width: 200, align: 'center' } }))
    expect(row.justify).toBe('center')
    expect(row.children[0].width).toBe(200)
    expect(drawing.width).toBe(200)
    // The same sheet, only smaller: its aspect follows the width.
    expect(drawing.height / drawing.width).toBeCloseTo((full.height + 18) / full.width, 0)
  })

  it('shows only the views the design asked for, and still lists a mark off them', () => {
    const top = drawingOf(print({ variant: 'top' })).drawing
    const captions = (d: any) =>
      d.shapes.filter((s: any) => s.type === 'text' && s.size === 36).map((s: any) => s.text)
    expect(captions(top)).toEqual(['Top'])
    const sides = drawingOf(print({ variant: 'sides' })).drawing
    expect(captions(sides)).toEqual(['Left', 'Right'])
    // The mark is on the left door: on the top-only sheet it has no spot,
    // and the legend lists it all the same.
    const legend = (spec: any) =>
      spec.blocks
        .find((b: any) => b.id === 'condition_map')
        .content.children.find((c: any) => c.kind === 'table').rows
    expect(legend(print({ variant: 'top' }))).toHaveLength(1)
    expect(top.shapes.some((s: any) => s.type === 'text' && s.text === '1')).toBe(false)
    expect(sides.shapes.some((s: any) => s.type === 'text' && s.text === '1')).toBe(true)
  })
})

describe('the blank sheet on a work order', () => {
  const workOrder = (blankOn: boolean, marks: ConditionMarkData[] = []) => {
    const layout = getDefaultLayout('work_order')
    return buildWorkOrderPrintSpec({
      data: {
        id: 'job1',
        title: 'Job',
        type: 'repair',
        serviceDate: new Date('2026-09-24T09:00:00Z'),
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        cost: 0,
        invoiceNumber: '1',
        partItems: [],
        laborItems: [],
        customer: { name: 'A' },
        vehicle: null,
      } as unknown as InvoiceData,
      job: {
        orderNumber: '1',
        statusLabel: 'Open',
        concerns: [],
        printedAt: new Date('2026-09-25T00:00:00Z'),
        conditionMarks: marks,
        bodyType: 'estate',
        conditionMapLabels: labels,
      },
      template: {
        layoutConfig: {
          ...layout,
          sections: layout.sections.map((s) =>
            s.id === 'condition_map'
              ? {
                  ...s,
                  fields: s.fields?.map((f) =>
                    f.id === 'blank_sheet' ? { ...f, visible: blankOn } : f
                  ),
                }
              : s
          ),
        },
      } as any,
      labels: {},
    }) as any
  }
  const block = (spec: any) => spec.blocks.find((b: any) => b.id === 'condition_map')?.content

  it('is off in a new work order design, and offered nowhere else', () => {
    const field = (type: 'work_order' | 'certificate' | 'invoice') =>
      getDefaultLayout(type)
        .sections.find((s) => s.id === 'condition_map')
        ?.fields?.find((f) => f.id === 'blank_sheet')
    expect(field('work_order')).toEqual({ id: 'blank_sheet', visible: false })
    expect(field('certificate')).toBeUndefined()
    expect(field('invoice')).toBeUndefined()
  })

  it('prints nothing for an unmarked job while it is off', () => {
    expect(block(workOrder(false))).toBeUndefined()
  })

  it('prints the empty drawing, the key of kinds and rows to write in when on', () => {
    const content = block(workOrder(true))
    const [sheet, key, table] = content.children
    expect(sheet.kind).toBe('drawing')
    // No mark on the sheet: no numbered disc.
    expect(sheet.shapes.some((s: any) => s.type === 'text' && s.text === '1')).toBe(false)
    // The key names every built-in kind the labels carry, with a glyph each.
    expect(key.kind).toBe('drawing')
    const names = key.shapes.filter((s: any) => s.type === 'text').map((s: any) => s.text)
    expect(names).toEqual(expect.arrayContaining(['Dent', 'Scratch']))
    expect(names).toHaveLength(8)
    expect(table.kind).toBe('table')
    expect(table.rows.map((r: any) => [r.n, r.area])).toEqual([
      ['1', ''],
      ['2', ''],
      ['3', ''],
      ['4', ''],
      ['5', ''],
      ['6', ''],
    ])
  })

  it('prints the marks, not the form, once the job has any', () => {
    const content = block(
      workOrder(true, [mark({ id: 'own', serviceRecordId: 'job1', bodyType: 'estate' })])
    )
    const table = content.children.find((c: any) => c.kind === 'table')
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0].area).toBe('Left front door')
    expect(content.children.filter((c: any) => c.kind === 'drawing')).toHaveLength(1)
  })

  it('leaves another visit’s marks off the form', () => {
    const earlier = mark({
      id: 'old',
      inspectionId: 'x',
      inspectionItemId: 'y',
      bodyType: 'estate',
    })
    const content = block(workOrder(true, [earlier]))
    const table = content.children.find((c: any) => c.kind === 'table')
    expect(table.rows.every((r: any) => r.area === '')).toBe(true)
  })
})
