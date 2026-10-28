import { describe, expect, it } from 'vitest'
import dePdf from '../../../messages/de/pdf.json'
import enPdf from '../../../messages/en/pdf.json'
import frPdf from '../../../messages/fr/pdf.json'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { documentNumbers, serviceTypeName } from '@/lib/document-numbers'

const NBSP = ' '

describe('documentNumbers', () => {
  it('writes distances grouped the way the language does', () => {
    expect(documentNumbers('fr').distance(86200)).toBe(`86${NBSP}200`)
    expect(documentNumbers('de').distance(86200)).toBe('86.200')
    expect(documentNumbers('en').distance(86200)).toBe('86,200')
    expect(documentNumbers('nb').distance(86200)).toBe(`86${NBSP}200`)
  })

  it('never prints the narrow space PDF fonts lack', () => {
    expect(documentNumbers('fr').distance(1234567)).not.toContain(' ')
  })

  it('writes hours and quantities with the decimal mark, never grouped', () => {
    expect(documentNumbers('fr').count(0.8)).toBe('0,8')
    expect(documentNumbers('de').count(1.5)).toBe('1,5')
    expect(documentNumbers('en').count(1.5)).toBe('1.5')
    expect(documentNumbers('fr').count(1000)).toBe('1000')
    expect(documentNumbers('fr').quantity(2.5, 'l')).toBe('2,5 l')
    expect(documentNumbers('fr').quantity(4)).toBe('4')
  })

  it('writes exactly what it did before when no language is given', () => {
    const legacy = documentNumbers(undefined)
    expect(legacy.count(0.8)).toBe('0.8')
    expect(legacy.quantity(2.5, 'l')).toBe('2.5 l')
    expect(legacy.distance(86200)).toBe((86200).toLocaleString())
  })

  it('names the service type in the document language, or as stored', () => {
    const fr = invoiceLabels(frPdf, 'invoice')
    expect(serviceTypeName('repair', fr)).toBe('Réparation')
    expect(serviceTypeName('custom', fr)).toBe('custom')
  })
})

function job(): InvoiceData {
  return {
    id: 'job',
    title: 'Service',
    description: null,
    type: 'repair',
    serviceDate: new Date(Date.UTC(2026, 9, 28, 12)),
    shopName: null,
    techName: null,
    mileage: 86200,
    diagnosticNotes: null,
    invoiceNotes: null,
    subtotal: 136.9,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 136.9,
    cost: 136.9,
    invoiceNumber: '1001',
    partItems: [
      { partNumber: null, name: 'Oil', quantity: 2.5, unit: 'l', unitPrice: 11.5, total: 28.75 },
    ],
    laborItems: [{ description: 'Labour', hours: 0.8, rate: 95, total: 76 }],
    vehicle: {
      make: 'Volkswagen',
      model: 'Golf',
      year: 2018,
      vin: null,
      licensePlate: 'AB-123-CD',
      mileage: 86200,
      customer: null,
    },
  }
}

function printed(locale: string, pdf: Record<string, Record<string, string>>): string {
  return JSON.stringify(
    buildInvoicePrintSpec({
      data: job(),
      invoiceSettings: { currencyCode: 'EUR', unitSystem: 'metric', dateFormat: 'dd/MM/yyyy' },
      labels: invoiceLabels(pdf, 'invoice'),
      locale,
    })
  )
}

describe('the printed invoice', () => {
  it('writes French numbers and the French service type on a French invoice', () => {
    const text = printed('fr', frPdf)
    expect(text).toContain(`86${NBSP}200 km`)
    expect(text).toContain('0,8')
    expect(text).toContain('2,5 l')
    expect(text).toContain('Réparation')
    expect(text).not.toContain('86,200')
    expect(text).not.toContain('repair')
  })

  it('writes German numbers on a German invoice', () => {
    const text = printed('de', dePdf)
    expect(text).toContain('86.200 km')
    expect(text).toContain('0,8')
    expect(text).toContain('Reparatur')
  })

  it('leaves an English invoice as it was', () => {
    const text = printed('en', enPdf)
    expect(text).toContain('86,200 km')
    expect(text).toContain('0.8')
    expect(text).toContain('2.5 l')
    expect(text).toContain('Repair')
  })
})
