/**
 * The linked inspection's results on the work order.
 *
 * The work order can print the two result sections the certificate has, from
 * the inspection linked to the job. They are a choice: off in a new design
 * and in every design saved before they existed, and silent when the job has
 * no inspection or the inspection has nothing graded yet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { inspection: { findFirst } } }))
vi.mock('@/features/inspections/Lib/inspectionPhotos', () => ({
  loadInspectionPhotos: vi.fn(async () => ({ photos: { i2: [{ dataUri: 'data:photo' }] } })),
}))

import { loadInspectionPhotos } from '@/features/inspections/Lib/inspectionPhotos'
import {
  inspectionResultsFor,
  loadLinkedInspectionResults,
} from '@/features/inspections/Lib/linkedInspectionResults.server'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { workOrderLabels } from '@/features/invoice-designer/Lib/workOrderLabels'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import {
  getDefaultLayout,
  mergeWithDefaults,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, workOrderPresets } from '@/features/settings/Schema/layoutPresets'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import pdfEn from '../../../../messages/en/pdf.json'
import pdfNb from '../../../../messages/nb/pdf.json'

/* eslint-disable @typescript-eslint/no-explicit-any */

const data = () =>
  ({
    id: 'svc_1',
    title: 'Service',
    description: null,
    type: 'repair',
    serviceDate: new Date('2026-09-24T09:00:00Z'),
    mileage: 84120,
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 100,
    cost: 100,
    discountValue: 0,
    partItems: [],
    laborItems: [{ description: 'Replace front pads', hours: 1, rate: 100, total: 100 }],
    customFields: [],
    findings: [],
    customer: { name: 'Alex Carter' },
    vehicle: { make: 'Volvo', model: 'V60', year: 2020, licensePlate: 'AB 12345' },
  }) as unknown as InvoiceData

const item = (id: string, name: string, condition: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  section: 'Brakes',
  sectionCode: '1',
  code: null,
  condition,
  notes: null,
  sortOrder: Number(id.slice(1)),
  ...over,
})

const inspection = () => ({
  severityScale: 'eu' as const,
  country: null,
  items: [
    item('i1', 'Brake pedal', 'pass'),
    item('i2', 'Brake hoses', 'fail', {
      notes: 'Cracked at the front left',
      imageUrls: ['/api/protected/files/org_1/inspections/hose.jpg'],
    }),
    item('i3', 'Brake fluid', 'attention'),
    item('i4', 'Headlamps', 'not_inspected', { section: 'Lighting', sectionCode: '4' }),
  ],
})

/**
 * The work order layout with these sections switched on and every kind of
 * graded row with them. The ungraded checks and the "no deficiencies" line
 * have switches of their own, set here by name.
 */
function withSections(
  ids: string[],
  switches: { ungraded_checks?: boolean; no_defects_note?: boolean; combined_table?: boolean } = {},
  layout = getDefaultLayout('work_order')
) {
  const on: Record<string, boolean> = { ungraded_checks: false, ...switches }
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      ids.includes(s.id)
        ? {
            ...s,
            visible: true,
            fields: s.fields?.map((f) => ({ ...f, visible: on[f.id] ?? true })),
          }
        : s
    ),
  }
}

function print(
  layout: InvoiceLayoutConfig | undefined,
  linkedInspection: ReturnType<typeof inspection> | null | undefined,
  labels: Record<string, string> = workOrderLabels(pdfEn as any)
) {
  return buildWorkOrderPrintSpec({
    data: data(),
    job: {
      orderNumber: '2026-0042',
      statusLabel: 'Open',
      concerns: [],
      printedAt: new Date('2026-09-25T10:00:00Z'),
      linkedInspectionId: linkedInspection ? 'insp_1' : null,
      linkedInspection,
    },
    labels,
    template: layout ? ({ layoutConfig: { ...layout, version: 3 } } as any) : undefined,
  }) as any
}

const printed = (spec: any): string[] => spec.blocks.map((b: any) => b.id)

function texts(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    if (n.kind === 'table') {
      out.push(...n.columns.map((c: any) => c.label).filter(Boolean))
      for (const row of n.rows ?? []) out.push(...Object.values(row).map(String).filter(Boolean))
    }
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

const blockOf = (spec: any, id: string) =>
  spec.blocks.find((b: any) => b.id === id)?.content ?? null

describe('the inspection results on a work order', () => {
  it('prints both blocks from the linked inspection when the design asks', () => {
    const spec = print(withSections(['defects', 'results_table']), inspection())
    const ids = printed(spec)
    expect(ids).toContain('defects')
    expect(ids).toContain('results_table')
    // After the condition map's place and ahead of the tables of the job.
    expect(ids.indexOf('defects')).toBeLessThan(ids.indexOf('results_table'))
    expect(ids.indexOf('results_table')).toBeLessThan(ids.indexOf('labor_table'))
    expect(ids.indexOf('defects')).toBeGreaterThan(ids.indexOf('job_description'))

    const defects = texts(blockOf(spec, 'defects'))
    expect(defects[0]).toBe('Deficiencies found')
    // Worst first, each with its grade and its note.
    expect(defects).toEqual([
      'Deficiencies found',
      expect.stringContaining('Major defect'),
      'Brake hoses',
      'Cracked at the front left',
      expect.stringContaining('Minor defect'),
      'Brake fluid',
    ])

    const results = texts(blockOf(spec, 'results_table'))
    expect(results[0]).toBe('All results')
    expect(results).toContain('Brake pedal')
    expect(results).toContain('Brake hoses')
    expect(results).toContain('No defect')
    expect(results).toContain('Status')
  })

  it('leaves out a check nobody has graded yet', () => {
    const all = texts(
      blockOf(print(withSections(['results_table']), inspection()), 'results_table')
    )
    expect(all).not.toContain('Headlamps')
    expect(all.join(' ')).not.toContain('Lighting')
  })

  it('prints nothing new at the default, linked inspection or not', () => {
    const plain = print(undefined, null)
    const linked = print(undefined, inspection())
    expect(printed(linked)).not.toContain('defects')
    expect(printed(linked)).not.toContain('results_table')
    expect(linked).toEqual(plain)
    // The Compact starting point leaves them off too.
    const compact = buildLayoutFromPreset(workOrderPresets[0])
    for (const id of ['defects', 'results_table']) {
      expect(compact.sections.find((s) => s.id === id)?.visible).toBe(false)
    }
  })

  it('prints nothing, not even a heading, for a job without an inspection', () => {
    const on = withSections(['defects', 'results_table'])
    for (const none of [null, undefined]) {
      const spec = print(on, none)
      expect(printed(spec)).not.toContain('defects')
      expect(printed(spec)).not.toContain('results_table')
      expect(printed(spec)).toEqual(printed(print(undefined, null)))
    }
  })

  it('prints nothing for an inspection nobody has started', () => {
    const untouched = inspection()
    untouched.items = untouched.items.map((i) => ({ ...i, condition: 'not_inspected' }))
    const spec = print(withSections(['defects', 'results_table']), untouched)
    expect(printed(spec)).not.toContain('defects')
    expect(printed(spec)).not.toContain('results_table')
  })

  it('prints the whole checklist, grades left empty, when the design asks for ungraded checks', () => {
    const untouched = inspection()
    untouched.items = untouched.items.map((i) => ({ ...i, condition: 'not_inspected' }))
    const spec = print(
      withSections(['defects', 'results_table'], { ungraded_checks: true, combined_table: false }),
      untouched
    )
    const table = (blockOf(spec, 'results_table').children as any[]).filter(
      (c) => c.kind === 'table'
    )
    // A table per section, in checklist order, every check on it.
    expect(table.map((t) => t.rows.map((r: any) => r.name))).toEqual([
      ['Brake pedal', 'Brake hoses', 'Brake fluid'],
      ['Headlamps'],
    ])
    expect(table.flatMap((t) => t.rows.map((r: any) => r.grade))).toEqual(['', '', '', ''])
    // And still nothing about deficiencies on a car nobody has looked at.
    expect(printed(spec)).not.toContain('defects')
  })

  it('puts an ungraded check in its place among the graded ones', () => {
    const on = withSections(['results_table'], { ungraded_checks: true })
    const rows = (blockOf(print(on, inspection()), 'results_table').children as any[])
      .filter((c) => c.kind === 'table')
      .flatMap((t) => t.rows.map((r: any) => [r.name, r.grade]))
    expect(rows).toEqual([
      ['Brake pedal', 'No defect'],
      ['Brake hoses', 'Major defect'],
      ['Brake fluid', 'Minor defect'],
      ['Headlamps', ''],
    ])
    // Each kind of row keeps its own switch: without the passed checks, the
    // sheet is what was found and what is still to do.
    const layout = getDefaultLayout('work_order')
    layout.sections = layout.sections.map((s) =>
      s.id === 'results_table'
        ? {
            ...s,
            visible: true,
            fields: s.fields?.map((f) => ({
              ...f,
              visible: f.id === 'ungraded_checks' || f.id === 'combined_table',
            })),
          }
        : s
    )
    const combined = (blockOf(print(layout, inspection()), 'results_table').children as any[]).find(
      (c) => c.kind === 'table'
    )
    expect(combined.rows.map((r: any) => [r.section, r.name])).toEqual([
      ['1. Brakes', 'Brake hoses'],
      ['1. Brakes', 'Brake fluid'],
      ['4. Lighting', 'Headlamps'],
    ])
  })

  it('says a graded car has no deficiencies, unless the design leaves the line out', () => {
    const clean = inspection()
    clean.items = clean.items.map((i) => ({
      ...i,
      condition: i.condition === 'not_inspected' ? 'not_inspected' : 'pass',
    }))
    const noted = print(withSections(['defects']), clean)
    expect(texts(blockOf(noted, 'defects'))).toEqual([
      'Deficiencies found',
      'No deficiencies were recorded.',
    ])
    const silent = print(withSections(['defects'], { no_defects_note: false }), clean)
    expect(printed(silent)).not.toContain('defects')
    // The switch is about the clean car only: a defect prints either way.
    const found = print(withSections(['defects'], { no_defects_note: false }), inspection())
    expect(texts(blockOf(found, 'defects'))).toContain('Brake hoses')
  })

  it('words the headings, the columns and the grades in the document language', () => {
    const labels = workOrderLabels(pdfNb as any)
    const spec = print(withSections(['defects', 'results_table']), inspection(), labels)
    const nb = (pdfNb as any).inspection
    expect(texts(blockOf(spec, 'defects'))[0]).toBe(nb.deficiencies)
    const results = texts(blockOf(spec, 'results_table'))
    expect(results[0]).toBe(nb.allResults)
    expect(results).toContain(nb.statusColumn)
    expect(results).toContain(nb.euPass)
  })

  it('takes the inspection vocabulary without changing a word the work order had', () => {
    for (const pdf of [pdfEn, pdfNb] as any[]) {
      const before = { ...pdf.invoice, ...pdf.common, ...pdf.workOrder }
      const after = workOrderLabels(pdf)
      for (const key of Object.keys(before)) {
        if (['title', 'invoiceNumberLabel', 'billTo'].includes(key)) continue
        expect(after[key]).toBe(before[key])
      }
      expect(after.title).toBe(pdf.workOrder.title)
      expect(after.allResults).toBe(pdf.inspection.allResults)
    }
  })
})

describe('the work order layout and the result sections', () => {
  it('has them off by default, after the condition map and before the checklist', () => {
    const layout = getDefaultLayout('work_order')
    const ids = layout.sections.map((s) => s.id)
    const at = ids.indexOf('condition_map')
    expect(ids.slice(at, at + 4)).toEqual([
      'condition_map',
      'defects',
      'results_table',
      'work_checklist',
    ])
    for (const id of ['defects', 'results_table']) {
      expect(layout.sections.find((s) => s.id === id)?.visible).toBe(false)
    }
  })

  it('gives a design saved before they existed both sections, hidden', () => {
    // A workshop's own design: everything on, the order its own, saved before
    // the result sections were offered.
    const before = getDefaultLayout('work_order')
    const saved: InvoiceLayoutConfig = {
      ...before,
      version: 3,
      sections: before.sections
        .filter((s) => s.id !== 'defects' && s.id !== 'results_table')
        .map((s, order) => ({ ...s, visible: true, order })),
    }
    const merged = mergeWithDefaults(saved)
    const ids = [...merged.sections].sort((a, b) => a.order - b.order).map((s) => s.id)
    const at = ids.indexOf('condition_map')
    expect(ids.slice(at, at + 4)).toEqual([
      'condition_map',
      'defects',
      'results_table',
      'work_checklist',
    ])
    for (const id of ['defects', 'results_table']) {
      const section = merged.sections.find((s) => s.id === id)
      expect(section?.visible).toBe(false)
      // With the certificate's own switches, at the certificate's defaults.
      expect(section?.fields?.length).toBeGreaterThan(0)
    }
    // And the sheet it prints is the one it printed before.
    const spec = print(saved, inspection())
    expect(printed(spec)).not.toContain('defects')
    expect(printed(spec)).not.toContain('results_table')
    expect(printed(spec)).toEqual(printed(print(saved, null)))
  })

  it('leaves a design built from a starting point in the order it was saved in', () => {
    // A starting point writes its own numbers on the built-in list and the
    // designer saves it like that until a section is moved. Joining such a
    // design must not put the sheet back in the built-in order.
    const shown = (layout: InvoiceLayoutConfig) =>
      [...layout.sections]
        .filter((s) => s.visible)
        .sort((a, b) => a.order - b.order)
        .map((s) => s.id)
    for (const preset of workOrderPresets) {
      const built = buildLayoutFromPreset(preset)
      const saved: InvoiceLayoutConfig = {
        ...built,
        version: 3,
        sections: built.sections.filter((s) => s.id !== 'defects' && s.id !== 'results_table'),
      }
      const merged = mergeWithDefaults(JSON.parse(JSON.stringify(saved)))
      expect(shown(merged), preset.id).toEqual(shown(saved))
      expect(merged.sections.find((s) => s.id === 'defects')?.visible, preset.id).toBe(false)
      expect(printed(print(saved, inspection())), preset.id).toEqual(printed(print(built, null)))
    }
  })

  it('shows sample results on the designer canvas once switched on', () => {
    const sample = buildSampleData(
      { name: 'Shop', address: 'A road', phone: '555', email: 's@example.com', logoUrl: '' } as any,
      [],
      ((key: string) => key) as any,
      workOrderLabels(pdfEn as any),
      'work_order'
    )
    const off = getDefaultLayout('work_order')
    const offSpec = buildDocumentSpec(off, themeOf({} as any, off), sample) as any
    expect(printed(offSpec)).not.toContain('results_table')
    const on = withSections(['defects', 'results_table'])
    const spec = buildDocumentSpec(on, themeOf({} as any, on), sample) as any
    expect(texts(blockOf(spec, 'defects')).join('\n')).toContain('sample.checkBrakeHoses')
    expect(texts(blockOf(spec, 'results_table'))).toContain('sample.checkBrakePedal')
    // The sample has one check still to do, for the switch that lists those.
    expect(texts(blockOf(spec, 'results_table'))).not.toContain('sample.checkStopLamps')
    const listed = withSections(['results_table'], { ungraded_checks: true })
    const full = buildDocumentSpec(listed, themeOf({} as any, listed), sample) as any
    expect(texts(blockOf(full, 'results_table'))).toContain('sample.checkStopLamps')
    // Still a work order: its own title, not the certificate's.
    expect(sample.meta.title).toBe((pdfEn as any).workOrder.title)
  })
})

describe('loading the linked inspection', () => {
  beforeEach(() => {
    findFirst.mockReset()
    vi.mocked(loadInspectionPhotos).mockClear()
  })

  it("asks for the workshop's own inspection on the job's own vehicle, finished or not", async () => {
    findFirst.mockResolvedValue({
      severityScale: null,
      country: null,
      template: { severityScale: 'basic', country: 'NO' },
      items: inspection().items,
    })
    const loaded = await loadLinkedInspectionResults('org_1', 'veh_1', 'insp_1', { photos: false })
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'insp_1',
      organizationId: 'org_1',
      vehicleId: 'veh_1',
    })
    expect(loaded?.severityScale).toBe('basic')
    expect(loaded?.country).toBe('NO')
    expect(loaded?.items).toHaveLength(4)
    expect(loaded?.itemPhotos).toBeUndefined()
  })

  it('reads the photographs only when the design shows them', async () => {
    findFirst.mockResolvedValue({
      severityScale: 'eu',
      country: null,
      template: { severityScale: 'eu', country: null },
      items: inspection().items,
    })
    const loaded = await loadLinkedInspectionResults('org_1', 'veh_1', 'insp_1', { photos: true })
    expect(loaded?.itemPhotos).toEqual({ i2: [{ dataUri: 'data:photo' }] })
    // Only the defects that have pictures are decoded: nothing else draws one.
    expect(vi.mocked(loadInspectionPhotos).mock.calls[0][0].map((i) => i.id)).toEqual(['i2'])
  })

  it('is not read at all for a design that prints neither section', async () => {
    findFirst.mockResolvedValue({
      severityScale: 'eu',
      country: null,
      template: { severityScale: 'eu', country: null },
      items: inspection().items,
    })
    // A quote raised from an inspection, its design at the defaults.
    const quote = { vehicleId: 'veh_1', inspectionId: 'insp_1' }
    expect(await inspectionResultsFor('org_1', quote, getDefaultLayout('invoice'))).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()

    const invoice = getDefaultLayout('invoice')
    const on = {
      ...invoice,
      sections: invoice.sections.map((s) =>
        s.id === 'results_table' ? { ...s, visible: true } : s
      ),
    }
    const loaded = await inspectionResultsFor('org_1', quote, on)
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'insp_1',
      organizationId: 'org_1',
      vehicleId: 'veh_1',
    })
    expect(loaded?.items).toHaveLength(4)
    // The table draws no photograph, so none is decoded for it.
    expect(loaded?.itemPhotos).toBeUndefined()
    expect(loadInspectionPhotos).not.toHaveBeenCalled()
  })

  it('is nothing without a link, without a vehicle, or with no checks', async () => {
    expect(await loadLinkedInspectionResults('org_1', 'veh_1', null, { photos: false })).toBeNull()
    expect(await loadLinkedInspectionResults('org_1', null, 'insp_1', { photos: false })).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
    findFirst.mockResolvedValue(null)
    expect(
      await loadLinkedInspectionResults('org_1', 'veh_1', 'other_org', { photos: false })
    ).toBeNull()
    findFirst.mockResolvedValue({ severityScale: null, country: null, template: {}, items: [] })
    expect(
      await loadLinkedInspectionResults('org_1', 'veh_1', 'insp_1', { photos: false })
    ).toBeNull()
  })
})
