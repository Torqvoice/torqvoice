/**
 * A job as the work order sheet words it: the strip says the order number
 * and the plate, nothing of the bill is on it, the customer's concerns and
 * the work as a checklist print when the design asks, and the customer gets
 * a line of their own to sign under their name.
 */
import { describe, expect, it } from 'vitest'
import {
  buildWorkOrderPrintSpec,
  workOrderQrWanted,
} from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { withWorkOrderLabels } from '@/features/invoice-designer/Lib/workOrderLabels'
import {
  getDefaultInvoiceLayout,
  getDefaultLayout,
  mergeWithDefaults,
  WORK_ORDER_SECTIONS,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { buildLayoutFromPreset, workOrderPresets } from '@/features/settings/Schema/layoutPresets'

/* eslint-disable @typescript-eslint/no-explicit-any */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='

const data = () =>
  ({
    id: 'svc_00000001',
    title: '2026-0042 - AB 12345',
    description: 'Customer asks for a road test after the brakes.\n\nCall before extra work.',
    type: 'repair',
    serviceDate: new Date('2026-09-24T09:00:00Z'),
    startDateTime: new Date('2026-09-25T08:30:00Z'),
    shopName: null,
    techName: 'Kari',
    mileage: 84120,
    diagnosticNotes: 'Internal: check the caliper slide pins.',
    invoiceNotes: '<p>Please bring the locking wheel nut.</p>',
    subtotal: 300,
    taxRate: 25,
    taxAmount: 75,
    totalAmount: 375,
    cost: 375,
    invoiceNumber: '2026-0042',
    discountValue: 0,
    partItems: [
      { partNumber: 'BP-1', name: 'Front pads', quantity: 1, unitPrice: 100, total: 100 },
    ],
    laborItems: [
      { description: 'Replace front pads', hours: 1.5, rate: 100, total: 150 },
      { description: 'Road test', hours: 0.5, rate: 100, total: 50 },
    ],
    customFields: [],
    findings: [],
    customer: {
      name: 'Alex Carter',
      email: null,
      phone: null,
      address: null,
      company: null,
      customerNumber: 'C-7',
    },
    vehicle: {
      make: 'Volvo',
      model: 'V60',
      year: 2020,
      vin: 'YV1',
      licensePlate: 'AB 12345',
      mileage: 84120,
      customer: null,
    },
  }) as unknown as InvoiceData

const job = () => ({
  orderNumber: '2026-0042',
  statusLabel: 'Waiting for approval',
  workBay: 'Bay 2',
  promisedAt: new Date('2026-09-25T16:00:00Z'),
  concerns: [
    { description: 'Grinding when braking', correction: 'Pads and discs replaced' },
    { description: 'Warning light', correction: null },
  ],
  qrDataUri: PNG,
  printedAt: new Date('2026-09-25T10:00:00Z'),
})

/** Every string a spec prints, in order. */
function texts(spec: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    if (n.kind === 'richtext' && n.html) out.push(String(n.html))
    if (n.kind === 'table')
      for (const row of n.rows ?? []) out.push(...Object.values(row).map(String))
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  for (const block of spec.blocks) walk(block.content)
  return out
}

function blockOf(spec: any, id: string) {
  return spec.blocks.find((block: any) => block.id === id)?.content ?? null
}

const labels = withWorkOrderLabels(
  { billTo: 'Bill To', signedBy: 'Signed by', signatureDate: 'Date' },
  {
    title: 'WORK ORDER',
    orderNumberLabel: 'Work order No.',
    customer: 'Customer',
    plateLabel: 'Plate',
    status: 'Status: {status}',
    workBay: 'Bay: {bay}',
    customerSignature: 'Customer signature',
    scanToOpen: 'Scan to open',
    printedOn: 'Printed {date}',
  }
)

function print(layout?: InvoiceLayoutConfig, over: Partial<ReturnType<typeof job>> = {}) {
  return buildWorkOrderPrintSpec({
    data: data(),
    job: { ...job(), ...over },
    labels,
    signer: { name: 'Jamie Lee', dataUri: PNG },
    template: layout ? ({ layoutConfig: { ...layout, version: 3 } } as any) : undefined,
    invoiceSettings: { currencyCode: 'EUR', dateFormat: 'yyyy-MM-dd' },
  }) as any
}

describe('the work order sheet', () => {
  it('prints from the work order layout even without a saved design', () => {
    const spec = print()
    const ids = spec.blocks.map((b: any) => b.id)
    expect(ids).toContain('concerns')
    expect(ids).not.toContain('bank_account')
    // The code to scan and the checklist are the board copy's, off until a
    // design asks for them.
    expect(ids).not.toContain('job_qr')
    expect(ids).not.toContain('work_checklist')
  })

  it('says the order number, the plate and the title in the strip, and no due date', () => {
    const strip = texts({ blocks: [{ content: blockOf(print(), 'document_title') }] })
    expect(strip).toContain('WORK ORDER')
    expect(strip).toContain('Work order No.')
    expect(strip).toContain('2026-0042')
    expect(strip).toContain('Plate')
    expect(strip).toContain('AB 12345')
    expect(strip.join(' ')).not.toMatch(/Due/)
  })

  it('carries nothing of the bill: totals end at the total, no payments, no bank details', () => {
    const spec = print()
    const all = texts(spec).join('\n')
    expect(all).toContain('Total')
    expect(all).not.toMatch(/PAID|Amount Due|Bank/)
    expect(blockOf(spec, 'bank_account')).toBeNull()
  })

  it('words the job: status, technician, scheduled and promised, with the bay a switch', () => {
    const shown = getDefaultLayout('work_order')
    shown.sections = shown.sections.map((s) =>
      s.id === 'job_details' ? { ...s, visible: true } : s
    )
    const lines = texts({ blocks: [{ content: blockOf(print(shown), 'job_details') }] })
    expect(lines).toContain('Status: Waiting for approval')
    expect(lines).toContain('Technician: Kari')
    expect(lines.some((l) => l.startsWith('Scheduled: 2026-09-25'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Promised: 2026-09-25'))).toBe(true)
    expect(lines).not.toContain('Bay: Bay 2')
    const layout = getDefaultLayout('work_order')
    layout.sections = layout.sections.map((s) =>
      s.id === 'job_details'
        ? { ...s, visible: true, fields: s.fields?.map((f) => ({ ...f, visible: true })) }
        : s
    )
    expect(texts({ blocks: [{ content: blockOf(print(layout), 'job_details') }] })).toContain(
      'Bay: Bay 2'
    )
  })

  it('starts short and black on white: name and phone, the car, no boxes, no colour', () => {
    const layout = getDefaultLayout('work_order')
    const visible = (id: string) => layout.sections.find((s) => s.id === id)?.visible
    const on = (id: string, field: string) =>
      layout.sections.find((s) => s.id === id)?.fields?.find((f) => f.id === field)?.visible
    expect(on('customer', 'customer_name')).toBe(true)
    expect(on('customer', 'customer_phone')).toBe(true)
    expect(on('customer', 'customer_address')).toBe(false)
    expect(on('vehicle', 'vin')).toBe(false)
    expect(on('vehicle', 'license_plate')).toBe(true)
    for (const id of [
      'service',
      'findings',
      'warranty',
      'attached_documents',
      'work_checklist',
      'notes',
      'header',
      'job_details',
      'job_qr',
    ]) {
      expect(visible(id)).toBe(false)
    }
    for (const id of ['customer', 'vehicle', 'job_details', 'signature']) {
      expect(layout.sections.find((s) => s.id === id)?.boxed).toBe(false)
    }
    expect(layout.document?.accentColor).toBe('#111827')
    expect(layout.document?.stripes).toBe(false)
    expect(layout.sections.find((s) => s.id === 'customer')?.column).toBe('left')
    expect(layout.sections.find((s) => s.id === 'vehicle')?.column).toBe('right')
    // The default and the Compact starting point are the same sheet.
    const compact = workOrderPresets.find((p) => p.id === 'work-order-compact')
    const strip = (config: InvoiceLayoutConfig) =>
      config.sections
        .filter((s) => s.visible)
        .sort((a, b) => a.order - b.order)
        .map((s) => [s.id, s.boxed, s.fields?.filter((f) => f.visible).map((f) => f.id)])
    expect(strip(buildLayoutFromPreset(compact!))).toEqual(strip(layout))
    expect(buildLayoutFromPreset(compact!).document).toEqual(layout.document)
  })

  it('numbers the concerns in order, with what was done under each', () => {
    const lines = texts({ blocks: [{ content: blockOf(print(), 'concerns') }] })
    expect(lines).toEqual([
      'Customer concerns',
      '1.',
      'Grinding when braking',
      'Pads and discs replaced',
      '2.',
      'Warning light',
    ])
  })

  it('prints the description as paragraphs and keeps internal notes off the sheet', () => {
    const all = texts(print()).join('\n')
    expect(all).toContain('<p>Customer asks for a road test after the brakes.</p>')
    expect(all).not.toContain('caliper slide pins')
  })

  it('lists the work as boxes to tick, without prices, when the checklist is on', () => {
    const layout = getDefaultLayout('work_order')
    layout.sections = layout.sections.map((s) =>
      s.id === 'work_checklist' ? { ...s, visible: true } : s
    )
    const block = blockOf(print(layout), 'work_checklist')
    const lines = texts({ blocks: [{ content: block }] })
    expect(lines).toContain('Replace front pads')
    expect(lines).toContain('1.5 hrs')
    expect(lines).toContain('Road test')
    expect(lines.join(' ')).not.toMatch(/€|150/)
    // One empty box per line: a bordered stack with nothing in it.
    const boxes: any[] = []
    const walk = (n: any) => {
      if (n?.kind === 'stack' && n.style?.borderWidth && n.children?.[0]?.kind === 'spacer')
        boxes.push(n)
      for (const child of n?.children ?? []) walk(child.node ?? child)
    }
    walk(block)
    expect(boxes).toHaveLength(2)
  })

  it('gives the customer a line of their own, under their name, beside the issuer', () => {
    const block = blockOf(print(), 'signature')
    const lines = texts({ blocks: [{ content: block }] })
    expect(lines).toContain('Signed by')
    expect(lines).toContain('Jamie Lee')
    expect(lines).toContain('Customer signature')
    expect(lines).toContain('Alex Carter')
    // A work order is signed with a pen: the issuer's saved image stays off.
    const images: string[] = []
    const walk = (n: any) => {
      if (n?.kind === 'image') images.push(n.src)
      for (const child of n?.children ?? []) walk(child.node ?? child)
    }
    walk(block)
    expect(images).toEqual([])
  })

  it('draws the code that opens the job on a phone only when the layout asks', () => {
    const withQr = getDefaultLayout('work_order')
    withQr.sections = withQr.sections.map((s) => (s.id === 'job_qr' ? { ...s, visible: true } : s))
    expect(blockOf(print(withQr), 'job_qr')).not.toBeNull()
    expect(blockOf(print(withQr, { qrDataUri: undefined }), 'job_qr')).toBeNull()
    expect(blockOf(print(), 'job_qr')).toBeNull()
    expect(workOrderQrWanted(withQr)).toBe(true)
    expect(workOrderQrWanted(getDefaultLayout('work_order'))).toBe(false)
    // Switched on, the code sits top right beside the customer and the car.
    const qr = print(withQr).blocks.find((b: any) => b.id === 'job_qr')
    expect(qr.placement).toMatchObject({ mode: 'flow', column: 'right' })
  })

  it('says when it was printed in the footer', () => {
    const footer = texts({ blocks: [{ content: blockOf(print(), 'footer') }] }).join(' ')
    expect(footer).toContain('Printed 2026-09-25')
  })
})

describe('the work order layout', () => {
  it('is its own list of sections, read back as one', () => {
    const merged = mergeWithDefaults({ documentType: 'work_order', sections: [] })
    expect(merged.documentType).toBe('work_order')
    expect(merged.sections.map((s) => s.id)).toEqual(WORK_ORDER_SECTIONS.map((s) => s.id))
  })

  it('starts with both signature lines on and the customer line off elsewhere', () => {
    const on = (layout: InvoiceLayoutConfig, id: string) =>
      layout.sections.find((s) => s.id === 'signature')?.fields?.find((f) => f.id === id)?.visible
    const workOrder = getDefaultLayout('work_order')
    expect(on(workOrder, 'customer_line')).toBe(true)
    expect(on(workOrder, 'inspector_line')).toBe(true)
    expect(on(workOrder, 'signature_image')).toBe(false)
    expect(workOrder.sections.find((s) => s.id === 'signature')?.visible).toBe(true)
    const invoice = getDefaultInvoiceLayout()
    expect(on(invoice, 'customer_line')).toBe(false)
    expect(on(invoice, 'signature_image')).toBe(true)
    // A saved invoice layout from before the switch existed gains it switched off.
    const merged = mergeWithDefaults({
      sections: [
        {
          id: 'signature',
          visible: true,
          order: 0,
          fields: [{ id: 'inspector_line', visible: true }],
        },
      ],
    })
    expect(on(merged, 'customer_line')).toBe(false)
  })

  it('keeps the plate cell off every strip but the work order', () => {
    const cell = (layout: InvoiceLayoutConfig) =>
      layout.sections
        .find((s) => s.id === 'document_title')
        ?.fields?.find((f) => f.id === 'license_plate')?.visible
    expect(cell(getDefaultLayout('work_order'))).toBe(true)
    expect(cell(getDefaultInvoiceLayout())).toBe(false)
    expect(cell(mergeWithDefaults({}))).toBe(false)
  })
})
