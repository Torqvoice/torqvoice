import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import {
  getDefaultInvoiceLayout,
  mergeWithDefaults,
  type InvoiceFieldConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { parseSignatureDataUri } from '@/features/signatures/Lib/signatureImage'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A real one-pixel PNG, which is all the checks need to see. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='

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

/** The invoice's signature block with these fields on, or null when it prints nothing. */
function signatureBlock(
  opts: { fields?: InvoiceFieldConfig[]; visible?: boolean; signer?: any } = {}
): any {
  const layout = getDefaultInvoiceLayout()
  layout.sections = layout.sections.map((section) =>
    section.id === 'signature'
      ? {
          ...section,
          visible: opts.visible ?? true,
          ...(opts.fields ? { fields: opts.fields } : {}),
        }
      : section
  )
  const spec: any = buildInvoicePrintSpec({
    data: invoice,
    template: { layoutConfig: { ...layout, version: 3 } } as any,
    signer: 'signer' in opts ? opts.signer : { name: 'Jamie Lee', dataUri: PNG },
  })
  return spec.blocks.find((block: any) => block.id === 'signature')?.content ?? null
}

function walk(node: any, visit: (n: any) => void) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child.node ?? child, visit)
}
const textsOf = (node: any) => {
  const out: string[] = []
  walk(node, (n) => n.kind === 'text' && n.text && out.push(String(n.text)))
  return out
}
const imagesOf = (node: any) => {
  const out: string[] = []
  walk(node, (n) => n.kind === 'image' && out.push(n.src))
  return out
}

describe('the signature on an invoice', () => {
  it('is off until a workshop switches it on', () => {
    expect(getDefaultInvoiceLayout().sections.find((s) => s.id === 'signature')?.visible).toBe(
      false
    )
    expect(signatureBlock({ visible: false })).toBeNull()
  })

  it('stays off on a layout saved before the section existed', () => {
    const saved = getDefaultInvoiceLayout()
    saved.sections = saved.sections.filter((section) => section.id !== 'signature')
    const merged = mergeWithDefaults(saved)
    expect(merged.sections.find((s) => s.id === 'signature')?.visible).toBe(false)
  })

  it('draws the signer’s signature on the line, with their name and the date', () => {
    const block = signatureBlock()
    expect(imagesOf(block)).toEqual([PNG])
    expect(textsOf(block)).toEqual(
      expect.arrayContaining(['Signature', 'Jamie Lee', 'Signed by', 'Date'])
    )
  })

  it('sets its columns on one baseline, so the signature and date lines meet', () => {
    // The signature prints at whatever height its image has; the date column
    // cannot know it, so the row lines the two up from the bottom.
    const row = signatureBlock().children.find((child: any) => child.kind === 'row')
    expect(row.align).toBe('end')
    expect(row.children).toHaveLength(2)
  })

  it('leaves the image off when the field is switched off', () => {
    const block = signatureBlock({
      fields: [
        { id: 'signature_image', visible: false },
        { id: 'inspector_line', visible: true },
        { id: 'inspector_name', visible: true },
        { id: 'date_line', visible: true },
      ],
    })
    expect(imagesOf(block)).toEqual([])
    expect(textsOf(block)).toContain('Jamie Lee')
  })

  it('prints an empty line for a pen when nobody has a signature', () => {
    const block = signatureBlock({ signer: { name: '' } })
    expect(block).not.toBeNull()
    expect(imagesOf(block)).toEqual([])
    expect(textsOf(block)).toContain('Signed by')
  })
})

describe('what a signature image may be', () => {
  it('takes a PNG', () => {
    expect(parseSignatureDataUri(PNG)?.mimeType).toBe('image/png')
  })

  it('refuses what the renderer cannot draw or was not made by the app', () => {
    expect(parseSignatureDataUri('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(parseSignatureDataUri('data:image/png;base64,AAAA')).toBeNull()
    expect(parseSignatureDataUri('/api/files/x/logos/a.png')).toBeNull()
    expect(parseSignatureDataUri(42)).toBeNull()
    const huge = `data:image/png;base64,${Buffer.alloc(400 * 1024).toString('base64')}`
    expect(parseSignatureDataUri(huge)).toBeNull()
  })
})
