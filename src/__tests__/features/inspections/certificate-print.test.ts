/**
 * An inspection as the certificate builder words it: the strip says the
 * certificate number and the dates, the defects come worst first, a check
 * nobody graded is left out, and the result is the one the grades give.
 */
import { describe, expect, it } from 'vitest'
import { buildCertificatePrintSpec } from '@/features/inspections/Pdf/buildCertificatePrint'
import {
  getDefaultLayout,
  mergeWithDefaults,
  unmentionedGrandfathered,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */

const item = (over: Record<string, unknown>) => ({
  id: 'x',
  name: 'Check',
  section: 'Braking',
  sectionCode: '1',
  code: null,
  condition: 'pass',
  notes: null,
  sortOrder: 0,
  ...over,
})

const data = () => ({
  id: 'cmuinspection000000000001',
  status: 'completed',
  mileage: 84120,
  notes: 'Tyres near the limit.',
  createdAt: new Date('2026-09-24T09:00:00Z'),
  completedAt: new Date('2026-09-24T10:30:00Z'),
  severityScale: 'eu',
  country: 'NO',
  vehicleCategory: 'M1',
  nextTestDue: new Date('2028-09-24T00:00:00Z'),
  certificateNumber: 'CERT-7',
  inspectorName: 'Kari',
  testLocation: 'Bay 2',
  template: { name: 'Annual test', severityScale: 'eu', country: 'NO' },
  vehicle: {
    make: 'Volvo',
    model: 'V60',
    year: 2020,
    vin: 'YV1',
    licensePlate: 'AB 12345',
    mileage: 80000,
    customer: { name: 'Ola' },
  },
  items: [
    item({ id: 'a', name: 'Wipers', condition: 'attention', notes: 'Smearing', sortOrder: 1 }),
    item({
      id: 'b',
      name: 'Brake hose',
      code: '1.1.13',
      condition: 'dangerous',
      notes: 'Split',
      sortOrder: 2,
    }),
    item({ id: 'c', name: 'Horn', condition: 'not_inspected', sortOrder: 3 }),
    item({ id: 'd', name: 'Tow bar', condition: 'not_applicable', sortOrder: 4 }),
    item({
      id: 'e',
      name: 'Lights',
      condition: 'pass',
      sortOrder: 5,
      section: 'Lighting',
      sectionCode: '4',
    }),
  ],
})

function texts(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    if (n.kind === 'table')
      for (const row of n.rows ?? []) out.push(...Object.values(row).map(String))
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

describe('the certificate a completed inspection prints', () => {
  const spec = buildCertificatePrintSpec({
    data: data() as any,
    workshop: { name: 'Shop', address: 'Road 1', phone: '555', email: 's@x.no' },
    labels: {
      title: 'VEHICLE INSPECTION',
      resultFailDangerous: 'Fail — dangerous defects',
      euDangerous: 'Dangerous defect',
      euAttention: 'Minor defect',
      euPass: 'No defect',
      euNotApplicable: 'Not applicable',
      invoiceNumberLabel: 'Certificate No.',
      dateLabel: 'Date of test',
      dueDateLabel: 'Next test due',
    },
    layoutConfig: getDefaultLayout('certificate'),
    itemPhotos: { b: [{ dataUri: 'data:image/jpeg;base64,AA==' }] },
    attachedDocuments: ['signed-form.pdf'],
  }) as any
  const block = (id: string) => spec.blocks.find((b: any) => b.id === id)?.content

  it('fails the vehicle on the dangerous defect and says so first', () => {
    expect(texts(block('result'))[0]).toBe('Fail — dangerous defects')
    expect(texts(block('result')).some((t) => t.includes('1 × No defect'))).toBe(true)
  })

  it('lists the defects worst first, numbered where the country numbers them', () => {
    const t = texts(block('defects'))
    const hose = t.findIndex((s) => s.includes('Brake hose'))
    const wipers = t.findIndex((s) => s.includes('Wipers'))
    expect(hose).toBeGreaterThan(-1)
    expect(hose).toBeLessThan(wipers)
    expect(t.some((s) => /3\s+—\s+Dangerous defect/.test(s))).toBe(true)
    expect(JSON.stringify(block('defects'))).toContain('data:image/jpeg;base64,AA==')
  })

  it('lists the checks that were not OK by default, and every graded check when asked', () => {
    const t = texts(block('results_table'))
    expect(t).toContain('Brake hose')
    expect(t).toContain('Wipers')
    expect(t).not.toContain('Tow bar')
    expect(t).not.toContain('Lights')
    expect(t).not.toContain('Horn')

    const layout = getDefaultLayout('certificate')
    // Every kind of graded row; the ungraded ones have a switch of their own.
    layout.sections = layout.sections.map((section) =>
      section.id === 'results_table'
        ? {
            ...section,
            fields: section.fields?.map((f) => ({ ...f, visible: f.id !== 'ungraded_checks' })),
          }
        : section
    )
    const everything = buildCertificatePrintSpec({
      data: data() as any,
      layoutConfig: layout,
    }) as any
    const all = texts(everything.blocks.find((b: any) => b.id === 'results_table')?.content)
    expect(all).toContain('Tow bar')
    expect(all).toContain('Lights')
    expect(all).not.toContain('Horn')
    expect(all.some((s) => s.includes('4. Lighting'))).toBe(true)
  })

  it('names the strip after the certificate, not an invoice', () => {
    const t = texts(block('document_title'))
    expect(t).toContain('Certificate No.')
    expect(t).toContain('CERT-7')
    expect(t).toContain('Next test due')
  })

  it('carries the notes, the attached form and the test details', () => {
    expect(JSON.stringify(block('notes'))).toContain('Tyres near the limit.')
    expect(texts(block('attached_documents'))[1]).toContain('signed-form.pdf')
    const details = texts(block('test_details'))
    expect(details.some((s) => s.includes('Kari'))).toBe(true)
    expect(details.some((s) => s.includes('Bay 2'))).toBe(true)
    expect(details.some((s) => s.includes('84,120'))).toBe(true)
  })
})

/**
 * The two choices the result sections offer: the line a clean car prints
 * under Defects, and the checks nobody has graded yet in All Results.
 */
describe('the certificate result switches', () => {
  /** The certificate layout with these fields of a section set. */
  function layoutWith(sectionId: string, switches: Record<string, boolean>) {
    const layout = getDefaultLayout('certificate')
    layout.sections = layout.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            fields: section.fields?.map((f) => ({ ...f, visible: switches[f.id] ?? f.visible })),
          }
        : section
    )
    return layout
  }
  const print = (layoutConfig: any, items = data().items) =>
    buildCertificatePrintSpec({ data: { ...data(), items } as any, layoutConfig }) as any
  const block = (spec: any, id: string) => spec.blocks.find((b: any) => b.id === id)?.content
  const rows = (spec: any) =>
    ((block(spec, 'results_table')?.children ?? []) as any[])
      .filter((c) => c.kind === 'table')
      .flatMap((t) => t.rows.map((r: any) => [r.name, r.grade]))

  const clean = () =>
    data().items.map((i) => ({
      ...i,
      condition: i.condition === 'not_inspected' ? 'not_inspected' : 'pass',
      notes: null,
    }))
  const untouched = () => data().items.map((i) => ({ ...i, condition: 'not_inspected' }))

  it('has the note on and the ungraded checks off in a new design', () => {
    const layout = getDefaultLayout('certificate')
    const on = (section: string, field: string) =>
      layout.sections.find((s) => s.id === section)?.fields?.find((f) => f.id === field)?.visible
    expect(on('defects', 'no_defects_note')).toBe(true)
    expect(on('results_table', 'ungraded_checks')).toBe(false)
  })

  it('says a clean car has no deficiencies, or prints no section when the note is off', () => {
    const noted = print(getDefaultLayout('certificate'), clean())
    expect(texts(block(noted, 'defects'))).toEqual([
      'Deficiencies found',
      'No deficiencies were recorded.',
    ])
    const silent = print(layoutWith('defects', { no_defects_note: false }), clean())
    expect(block(silent, 'defects')).toBeUndefined()
    // A defect prints whatever the switch says.
    const found = print(layoutWith('defects', { no_defects_note: false }))
    expect(texts(block(found, 'defects')).some((s) => s.includes('Brake hose'))).toBe(true)
  })

  it('never says "no deficiencies" about a car nobody has looked at', () => {
    for (const note of [true, false]) {
      const spec = print(layoutWith('defects', { no_defects_note: note }), untouched())
      expect(block(spec, 'defects')).toBeUndefined()
      expect(JSON.stringify(spec)).not.toContain('No deficiencies were recorded.')
    }
  })

  it('lists the ungraded checks in their places, grade left empty, when asked', () => {
    expect(rows(print(getDefaultLayout('certificate'))).map(([name]) => name)).not.toContain('Horn')
    const asked = print(
      layoutWith('results_table', {
        ungraded_checks: true,
        passed_checks: true,
        not_applicable_checks: true,
      })
    )
    expect(rows(asked)).toEqual([
      ['Wipers', '1 — Minor defect'],
      ['Brake hose', '3 — Dangerous defect'],
      ['Horn', ''],
      ['Tow bar', 'Not applicable'],
      ['Lights', '0 — No defect'],
    ])
    // On its own it adds only the ungraded rows to the defects.
    expect(rows(print(layoutWith('results_table', { ungraded_checks: true })))).toEqual([
      ['Wipers', '1 — Minor defect'],
      ['Brake hose', '3 — Dangerous defect'],
      ['Horn', ''],
    ])
  })

  it('prints an inspection nobody has started as the whole checklist when asked', () => {
    expect(block(print(getDefaultLayout('certificate'), untouched()), 'results_table')).toBe(
      undefined
    )
    const sheet = print(layoutWith('results_table', { ungraded_checks: true }), untouched())
    expect(rows(sheet)).toEqual([
      ['Wipers', ''],
      ['Brake hose', ''],
      ['Horn', ''],
      ['Tow bar', ''],
      ['Lights', ''],
    ])
    expect(texts(block(sheet, 'results_table')).some((s) => s.includes('4. Lighting'))).toBe(true)
  })

  it('prints a design saved before the switches existed exactly as it did', () => {
    // As the designer stored it: the two sections with the fields they had.
    const current = getDefaultLayout('certificate')
    const saved = {
      ...current,
      version: 3,
      sections: current.sections.map((section) =>
        section.id === 'defects' || section.id === 'results_table'
          ? {
              ...section,
              fields: section.fields?.filter(
                (f) => f.id !== 'no_defects_note' && f.id !== 'ungraded_checks'
              ),
            }
          : section
      ),
    }
    // The note on, the ungraded checks off: what every certificate printed.
    expect(texts(block(print(saved, clean()), 'defects'))).toContain(
      'No deficiencies were recorded.'
    )
    expect(rows(print(saved)).map(([name]) => name)).not.toContain('Horn')
    for (const items of [data().items, clean()]) {
      expect(print(saved, items)).toEqual(print(current, items))
    }
    // Read back, the switches show what the sheet is already doing.
    const merged = mergeWithDefaults(saved)
    const on = (section: string, field: string) =>
      merged.sections.find((s) => s.id === section)?.fields?.find((f) => f.id === field)?.visible
    expect(on('defects', 'no_defects_note')).toBe(true)
    expect(on('results_table', 'ungraded_checks')).toBe(false)
    // And the designer, which resolves a stored list without merging it,
    // reads the note as on and the ungraded checks as off too.
    const stored = saved.sections.find((s) => s.id === 'defects')?.fields
    expect(unmentionedGrandfathered('defects', stored)).toEqual(['no_defects_note'])
    expect(
      unmentionedGrandfathered(
        'results_table',
        saved.sections.find((s) => s.id === 'results_table')?.fields
      )
    ).toEqual([])
  })
})
