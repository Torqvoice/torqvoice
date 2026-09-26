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
    expect(block.children.some((c: any) => c.kind === 'drawing')).toBe(true)
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
})
