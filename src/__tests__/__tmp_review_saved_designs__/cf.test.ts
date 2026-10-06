/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as NEW from '@/features/settings/Schema/invoiceLayoutSchema'
import * as OLD from './head/invoiceLayoutSchema'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import pdfEn from '../../../messages/en/pdf.json'

const OUT = process.env.OUT_FILE as string
const lines: string[] = []

const invoice: any = {
  id: 'svc_00000001',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-24T09:00:00Z'),
  shopName: null,
  techName: null,
  mileage: 84120,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: '2026-0042',
  partItems: [],
  laborItems: [{ description: 'Replace front pads', hours: 1, rate: 100, total: 100 }],
  customer: null,
  vehicle: null,
  customFields: [{ fieldId: 'abc', label: 'Fleet number', value: 'FLEET-777', fieldType: 'text' }],
}
const results = () => ({
  severityScale: 'eu' as const,
  country: null,
  items: [
    { id: 'i1', name: 'Brake pedal', section: 'Brakes', sectionCode: '1', code: null, condition: 'pass', notes: null, sortOrder: 1 },
    { id: 'i2', name: 'Brake hoses', section: 'Brakes', sectionCode: '1', code: null, condition: 'fail', notes: 'Cracked', sortOrder: 2 },
  ],
})

describe('custom field placement', () => {
  it('placement list and print', () => {
    const placement = (m: any) =>
      m.BUILTIN_SECTIONS.map((s: any) => s.id).filter(
        (id: string) => m.SECTIONS_WITH_FIELDS.has(id) && !m.NO_CUSTOM_FIELD_SECTIONS.has(id)
      )
    lines.push(`HEAD placement options: ${placement(OLD).join(', ')}`)
    lines.push(`NEW  placement options: ${placement(NEW).join(', ')}`)

    const base = NEW.getDefaultLayout('invoice')
    const print = (layout: any) =>
      JSON.stringify(
        buildInvoicePrintSpec({
          data: invoice,
          labels: invoiceLabels(pdfEn as any),
          template: { layoutConfig: layout },
          inspectionResults: results(),
        } as any)
      )

    // Field placed in Vehicle (prints)
    const inVehicle = {
      ...base,
      version: 3,
      sections: base.sections.map((s) =>
        s.id === 'vehicle' ? { ...s, fields: [...(s.fields ?? []), { id: 'cf_abc', visible: true }] } : s
      ),
    }
    lines.push(`cf in vehicle prints: ${print(inVehicle).includes('FLEET-777')}`)

    // Same thing setCustomFieldPlacement does for placement 'defects': remove elsewhere, push to target, keep visibility.
    const move = (layout: any, target: string, showSection: boolean) => ({
      ...layout,
      sections: layout.sections.map((s: any) => {
        const fields = (s.fields ?? []).filter((f: any) => f.id !== 'cf_abc')
        if (s.id !== target) return s.fields ? { ...s, fields } : s
        return { ...s, fields: [...fields, { id: 'cf_abc', visible: true }], visible: showSection ? true : s.visible }
      }),
    })
    for (const target of ['defects', 'results_table']) {
      lines.push(`cf moved to ${target} (section hidden as default) prints: ${print(move(inVehicle, target, false)).includes('FLEET-777')}`)
      const shown = print(move(inVehicle, target, true))
      lines.push(`cf moved to ${target} (section switched on) prints: ${shown.includes('FLEET-777')} ; section itself prints: ${shown.includes('Brake hoses')}`)
    }
    writeFileSync(`${OUT}.cf.txt`, lines.join('\n'))
    expect(true).toBe(true)
  })
})
