/**
 * @vitest-environment node
 *
 * The German type approval key, HSN/TSN, from fields 2.1 and 2.2 of the
 * Zulassungsbescheinigung Teil I. Kept on the vehicle, typed or pasted the
 * way it comes off the papers, and printed on every document that names the
 * car: the invoice, the quote and the work order.
 */
import { describe, expect, it } from 'vitest'
import {
  formatTypeKey,
  normalizeHsn,
  normalizeTsn,
  typeKeyLine,
  searchWordsOf,
  typeKeySearchTerms,
} from '@/features/vehicles/Lib/typeKey'
import { gateTypeKey, typeKeyEnabledIn } from '@/features/vehicles/Lib/typeKeySetting'
import { fieldsFor } from '@/features/import/Lib/fields'
import { createVehicleSchema, updateVehicleSchema } from '@/features/vehicles/Schema/vehicleSchema'
import { normalizeTypeKey } from '@/features/import/Lib/normalize'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

describe('reading the type key off the papers', () => {
  it('takes the HSN with the spaces people type into it', () => {
    expect(normalizeHsn(' 06 03 ')).toBe('0603')
  })

  it('cuts a whole field 2.2 down to the TSN, which is its first three characters', () => {
    expect(normalizeTsn('bfq00046')).toBe('BFQ')
    expect(normalizeTsn('BFQ 00046')).toBe('BFQ')
    expect(normalizeTsn('ahe')).toBe('AHE')
  })

  it('quotes the pair as it is read out, and one half alone when that is all there is', () => {
    expect(formatTypeKey('0603', 'BFQ')).toBe('0603 / BFQ')
    expect(formatTypeKey('0603', null)).toBe('0603')
    expect(formatTypeKey(null, null)).toBe('')
  })

  it('prints nothing for a vehicle without one, rather than a caption', () => {
    expect(typeKeyLine({ hsn: null, tsn: null }, 'HSN/TSN: {typeKey}')).toBe('')
    expect(typeKeyLine(null, undefined)).toBe('')
    expect(typeKeyLine({ hsn: '0603', tsn: 'BFQ' }, 'HSN/TSN: {typeKey}')).toBe(
      'HSN/TSN: 0603 / BFQ'
    )
  })
})

describe('searching by the type key, the way the plate is searched', () => {
  it('reads a four-digit word as an HSN', () => {
    expect(typeKeySearchTerms('0603')).toEqual([{ hsn: '0603' }])
  })

  it('reads a three-character word as a TSN, whatever its case', () => {
    expect(typeKeySearchTerms('bfq')).toEqual([{ tsn: 'BFQ' }])
  })

  it('reads the pair typed or pasted as one word', () => {
    for (const word of ['0603/BFQ', '0603BFQ', '0603-bfq']) {
      expect(typeKeySearchTerms(word), word).toEqual([{ hsn: '0603', tsn: 'BFQ' }])
    }
  })

  it('finds the key pasted back the way it is shown, "0603 / BFQ"', () => {
    expect(searchWordsOf('0603 / BFQ')).toEqual(['0603', 'BFQ'])
    // A search that is only a separator still searches for it.
    expect(searchWordsOf('/')).toEqual(['/'])
  })

  it('adds nothing for a word that cannot be part of a key', () => {
    expect(typeKeySearchTerms('Golf')).toEqual([])
    expect(typeKeySearchTerms('AB12345')).toEqual([])
  })
})

describe('the setting', () => {
  const vehicle = { make: 'VW', hsn: '0603', tsn: 'BFQ' }

  it('hides the key while it is off, and keeps the rest of the vehicle', () => {
    expect(gateTypeKey(vehicle, false)).toEqual({ make: 'VW', hsn: null, tsn: null })
    expect(gateTypeKey(vehicle, true)).toBe(vehicle)
  })

  it('is off for a marine workshop, which has no switch for it', () => {
    const on = { 'vehicle.typeKeyEnabled': 'true' }
    expect(typeKeyEnabledIn(on)).toBe(true)
    expect(typeKeyEnabledIn({ ...on, 'workshop.serviceType': 'marine' })).toBe(false)
    expect(typeKeyEnabledIn({})).toBe(false)
  })

  it('offers the import columns only when it is on', () => {
    const keys = (typeKey: boolean) => fieldsFor('vehicles', { typeKey }).map((f) => f.key)
    expect(keys(false)).not.toContain('vehicle.hsn')
    expect(keys(true)).toEqual(expect.arrayContaining(['vehicle.hsn', 'vehicle.tsn']))
  })
})

describe('saving a vehicle', () => {
  const base = { make: 'VW', model: 'Golf', year: 2019 }

  it('stores the normalised key', () => {
    const parsed = createVehicleSchema.parse({ ...base, hsn: '06 03', tsn: 'bfq00046' })
    expect(parsed.hsn).toBe('0603')
    expect(parsed.tsn).toBe('BFQ')
  })

  it('refuses what is not a type key', () => {
    expect(createVehicleSchema.safeParse({ ...base, hsn: '603' }).success).toBe(false)
    expect(createVehicleSchema.safeParse({ ...base, hsn: 'ABCD' }).success).toBe(false)
    expect(createVehicleSchema.safeParse({ ...base, tsn: 'AB' }).success).toBe(false)
  })

  it('lets an edit clear both, since an empty field is how clearing is said', () => {
    const parsed = updateVehicleSchema.parse({ id: 'v1', hsn: '', tsn: '' })
    expect(parsed.hsn).toBe('')
    expect(parsed.tsn).toBe('')
  })
})

describe('importing a spreadsheet', () => {
  it('takes two columns as they are', () => {
    expect(normalizeTypeKey('0603', 'BFQ')).toMatchObject({ hsn: '0603', tsn: 'BFQ' })
  })

  it('splits one column holding both', () => {
    expect(normalizeTypeKey('0603/BFQ', null)).toMatchObject({ hsn: '0603', tsn: 'BFQ' })
    expect(normalizeTypeKey('0603 BFQ00046', null)).toMatchObject({ hsn: '0603', tsn: 'BFQ' })
  })

  it('restores the leading zero a spreadsheet takes off', () => {
    expect(normalizeTypeKey('603', 'BFQ')).toMatchObject({ hsn: '0603', invalidHsn: false })
  })

  it('leaves out and reports what is not a type key', () => {
    expect(normalizeTypeKey('VW', 'BFQ')).toEqual({
      hsn: null,
      tsn: 'BFQ',
      invalidHsn: true,
      invalidTsn: false,
    })
  })
})

const vehicle = {
  make: 'Volkswagen',
  model: 'Golf',
  year: 2019,
  vin: null,
  licensePlate: 'B-AB 123',
  hsn: '0603',
  tsn: 'BFQ',
  mileage: 1000,
  customer: null,
}

const invoiceData = {
  id: 'svc1',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-26'),
  invoiceDate: new Date('2026-09-26'),
  shopName: 'Shop',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'A', email: null, phone: null, address: null, company: null },
  vehicle,
} as unknown as InvoiceData

const labels = { typeKey: 'HSN/TSN: {typeKey}' }

function vehicleBlock(spec: { blocks: { id: string }[] }) {
  return JSON.stringify(spec.blocks.find((b) => b.id === 'vehicle') ?? {})
}

describe('printing the type key', () => {
  it('prints it on the invoice', () => {
    const spec = buildInvoicePrintSpec({ data: invoiceData, labels })
    expect(vehicleBlock(spec)).toContain('HSN/TSN: 0603 / BFQ')
  })

  it('prints it on the quote', () => {
    const spec = buildQuotePrintSpec({
      data: {
        ...(invoiceData as unknown as Record<string, unknown>),
        quoteNumber: 'Q-1',
        status: 'draft',
        createdAt: new Date('2026-09-26'),
        validUntil: null,
        notes: null,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
      } as never,
      labels,
    })
    expect(vehicleBlock(spec)).toContain('HSN/TSN: 0603 / BFQ')
  })

  it('prints it on the work order', () => {
    const spec = buildWorkOrderPrintSpec({
      data: invoiceData,
      job: {
        orderNumber: '1',
        statusLabel: 'Open',
        concerns: [],
        printedAt: new Date('2026-09-26T00:00:00Z'),
      } as never,
      labels,
    })
    expect(vehicleBlock(spec)).toContain('HSN/TSN: 0603 / BFQ')
  })

  it('prints nothing for a car without one', () => {
    const spec = buildInvoicePrintSpec({
      data: { ...invoiceData, vehicle: { ...vehicle, hsn: null, tsn: null } } as InvoiceData,
      labels,
    })
    expect(vehicleBlock(spec)).not.toContain('HSN/TSN')
  })

  it('is switched on in a layout saved before the field existed', () => {
    for (const layout of [getDefaultInvoiceLayout(), getDefaultLayout('work_order')]) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'vehicle' ? { ...s, fields: s.fields?.filter((f) => f.id !== 'hsn_tsn') } : s
        ),
      }
      const merged = mergeWithDefaults(saved)
      const field = merged.sections
        .find((s) => s.id === 'vehicle')
        ?.fields?.find((f) => f.id === 'hsn_tsn')
      expect(field?.visible).toBe(true)
    }
  })
})
