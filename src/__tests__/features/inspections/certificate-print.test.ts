/**
 * An inspection as the certificate builder words it: the strip says the
 * certificate number and the dates, the defects come worst first, a check
 * nobody graded is left out, and the result is the one the grades give.
 */
import { describe, expect, it } from 'vitest'
import { buildCertificatePrintSpec } from '@/features/inspections/Pdf/buildCertificatePrint'
import { getDefaultLayout } from '@/features/settings/Schema/invoiceLayoutSchema'

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

  it('prints every graded check by section and leaves the ungraded one out', () => {
    const t = texts(block('results_table'))
    expect(t).toContain('Tow bar')
    expect(t).toContain('Lights')
    expect(t).not.toContain('Horn')
    expect(t.some((s) => s.startsWith('4. Lighting'))).toBe(true)
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
