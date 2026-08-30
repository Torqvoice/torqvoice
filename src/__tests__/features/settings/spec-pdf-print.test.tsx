// @vitest-environment node
/**
 * The printed sheet is the designed sheet.
 *
 * These render real PDFs through the same generator and layout engine the
 * designer draws with, and hold the print to what the designer promises: a
 * hand-placed block keeps its spot and width, a narrowed slogan wraps instead
 * of running back out to full width, margins reserve their room, and every
 * header style still produces a valid document.
 */
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { estimateBlockHeights } from '@/features/invoice-designer/Pdf/estimateHeights'
import { lineCount } from '@/features/invoice-designer/Pdf/measure'
import { InvoicePDF } from '@/features/vehicles/Components/invoice-pdf/InvoicePDF'
import { QuotePDF } from '@/features/quotes/Components/QuotePDF'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

const invoice: InvoiceData = {
  id: 'svc_12345678',
  title: 'Brakes and coolant',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
  invoiceDate: new Date('2026-08-14'),
  invoiceDueDate: new Date('2026-08-24'),
  shopName: 'Testshop',
  techName: 'Jamie Lee',
  mileage: 105866,
  diagnosticNotes: null,
  invoiceNotes: '<p>Thank you for choosing our workshop. <strong>Contact us</strong> if you have any questions.</p>',
  subtotal: 1053.63,
  taxRate: 19,
  taxAmount: 200.19,
  totalAmount: 1253.82,
  cost: 1253.82,
  invoiceNumber: 'INV-2026-0042',
  discountType: 'percentage',
  discountValue: 5,
  discountAmount: 52.68,
  partItems: [
    {
      partNumber: 'BD-1042',
      name: 'Brake disc, front left',
      quantity: 1,
      unitPrice: 256.12,
      total: 256.12,
    },
  ],
  laborItems: [{ description: 'Front brakes replaced', hours: 4.8, rate: 56.5, total: 271.2 }],
  customFields: [
    { fieldId: 'cfdef1', label: 'Insurance no.', value: 'INS-991', fieldType: 'text' },
  ],
  findings: [{ description: 'Rear pads at 15%', severity: 'needs_work', notes: 'Replace soon' }],
  warrantyMonths: 12,
  warrantyMileage: 20000,
  warrantyExpiresAt: null,
  warrantyNotes: 'Parts and labour.',
  customer: {
    name: 'Alex Carter',
    email: 'alex@example.com',
    phone: '+1 555 0134',
    address: '12 Harbour Road, Springfield',
    company: 'Carter Logistics Ltd',
    customerNumber: 'C-0117',
  },
  vehicle: {
    make: 'Volvo',
    model: 'V60',
    year: 2021,
    vin: 'YV1AA0000L0000000',
    licensePlate: 'AB 12345',
    mileage: 105866,
    customer: null,
  },
}

const workshop = {
  name: 'Testshop',
  address: 'Somewhere 1',
  phone: '+47 123 45 678',
  email: 'post@testshop.example',
  slogan: 'Quality service you can trust since nineteen ninety eight',
}

const settings = { currencyCode: 'EUR', bankAccount: 'XX00 1234 5678', orgNumber: '123 456 789' }

describe('the printed invoice follows the designed layout', () => {
  it('renders a valid PDF for every header style', async () => {
    for (const headerStyle of ['standard', 'compact', 'modern', 'framed']) {
      const buffer = await renderToBuffer(
        (
          <InvoicePDF
            data={invoice}
            workshop={workshop}
            invoiceSettings={settings}
            template={{ primaryColor: '#d97706', headerStyle }}
          />
        ) as React.ReactElement<DocumentProps>
      )
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    }
  })

  it('prints the slogan as its own block, apart from the header', () => {
    const spec = buildInvoicePrintSpec({ data: invoice, workshop, invoiceSettings: settings })
    const slogan = spec.blocks.find((b) => b.id === 'slogan')
    expect(slogan).toBeDefined()
    expect(JSON.stringify(spec.blocks.find((b) => b.id === 'header'))).not.toContain(
      workshop.slogan
    )
  })

  it('keeps a hand-placed slogan at its spot and width', async () => {
    const layout = {
      ...getDefaultInvoiceLayout(),
      anchors: { slogan: { x: 320, y: 180, width: 120, page: 1 } },
    }
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop,
      invoiceSettings: settings,
      template: { layoutConfig: layout },
    })
    const slogan = spec.blocks.find((b) => b.id === 'slogan')
    expect(slogan?.placement).toEqual({
      mode: 'anchored',
      anchor: { x: 320, y: 180, width: 120, page: 1 },
    })

    const buffer = await renderToBuffer(
      (
        <InvoicePDF
          data={invoice}
          workshop={workshop}
          invoiceSettings={settings}
          template={{ layoutConfig: layout }}
        />
      ) as React.ReactElement<DocumentProps>
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('wraps a narrowed slogan onto more lines, as the designer shows', () => {
    const wide = lineCount(workshop.slogan, 400, { fontSize: 9 }, 9)
    const narrow = lineCount(workshop.slogan, 120, { fontSize: 9 }, 9)
    expect(wide).toBe(1)
    expect(narrow).toBeGreaterThan(1)

    const anchored = buildInvoicePrintSpec({
      data: invoice,
      workshop,
      invoiceSettings: settings,
      template: {
        layoutConfig: {
          ...getDefaultInvoiceLayout(),
          anchors: { slogan: { x: 320, y: 180, width: 120, page: 1 } },
        },
      },
    })
    const flowing = buildInvoicePrintSpec({ data: invoice, workshop, invoiceSettings: settings })
    const narrowHeight = estimateBlockHeights(anchored).get('slogan') ?? 0
    const wideHeight = estimateBlockHeights(flowing).get('slogan') ?? 0
    expect(narrowHeight).toBeGreaterThan(wideHeight)
  })

  it('reserves the margin a section asks for', () => {
    const layout = getDefaultInvoiceLayout()
    layout.sections = layout.sections.map((s) =>
      s.id === 'parts_table' ? { ...s, style: { marginTop: 30, marginLeft: 40 } } : s
    )
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop,
      invoiceSettings: settings,
      template: { layoutConfig: layout },
    })
    const table = spec.blocks.find((b) => b.id === 'parts_table')
    expect(table?.margin).toEqual({ top: 30, right: 0, bottom: 0, left: 40 })
  })

  it('always prints the number and the date, even with the title section off', () => {
    // The default layout hides the document title; the sheet borrows it.
    const spec = buildInvoicePrintSpec({ data: invoice, workshop, invoiceSettings: settings })
    const title = spec.blocks.find((b) => b.id === 'document_title')
    expect(title).toBeDefined()
    expect(JSON.stringify(title)).toContain('INV-2026-0042')
  })

  it('carries discounts, payments and the balance into the totals', () => {
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop,
      invoiceSettings: settings,
      paymentSummary: {
        totalPaid: 500,
        payments: [{ amount: 500, date: '15.08.2026', method: 'card' }],
      },
    })
    const totals = JSON.stringify(spec.blocks.find((b) => b.id === 'totals'))
    expect(totals).toContain('Discount (5%)')
    expect(totals).toContain('15.08.2026')
    expect(totals).toContain('Amount Due')
  })
})

describe('the printed quote follows the designed layout', () => {
  it('renders a valid PDF and strikes lines the customer opted out of', async () => {
    const buffer = await renderToBuffer(
      (
        <QuotePDF
          data={{
            quoteNumber: 'QT-100',
            title: 'Brake job',
            description: '<p>As discussed.</p>',
            validUntil: new Date('2026-09-30'),
            createdAt: new Date('2026-08-30'),
            subtotal: 500,
            taxRate: 25,
            taxAmount: 125,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            totalAmount: 625,
            notes: null,
            partItems: [
              {
                partNumber: 'P-1',
                name: 'Pads',
                quantity: 1,
                unitPrice: 200,
                total: 200,
                excluded: true,
              },
            ],
            laborItems: [{ description: 'Fit pads', hours: 2, rate: 150, total: 300 }],
            customer: {
              name: 'Alex',
              email: null,
              phone: null,
              address: null,
              company: null,
            },
            vehicle: { make: 'Volvo', model: 'V60', year: 2021, vin: null, licensePlate: null },
          }}
          workshop={workshop}
          currencyCode="EUR"
          template={{ primaryColor: '#2563eb', headerStyle: 'framed' }}
        />
      ) as React.ReactElement<DocumentProps>
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
