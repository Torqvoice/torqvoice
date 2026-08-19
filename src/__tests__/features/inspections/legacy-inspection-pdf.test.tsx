/**
 * @vitest-environment node
 *
 * Upgrade safety for the certificate PDF of inspections recorded before the
 * overhaul.
 *
 * `legacy-inspection-compat.test.tsx` covers the shared web report; this covers
 * the other renderer of the same rows, which is the one a workshop reaches for
 * when it needs a copy of a report it issued months ago. The fixture is built
 * from the v1.2.38 columns and nothing else, so a new field the PDF starts
 * depending on shows up here as a failure rather than as a 500 on a customer's
 * download.
 */
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { InspectionPDF } from '@/features/inspections/Components/InspectionPDF'

/** Exactly the v1.2.38 `InspectionItem` columns: nothing added since. */
const legacyItem = (over: Record<string, unknown> = {}) => ({
  id: 'legacy-item',
  name: 'Brake Pads',
  section: 'Brakes',
  sortOrder: 1,
  condition: 'fail',
  notes: 'Worn down to 2mm',
  imageUrls: [] as string[],
  ...over,
})

const LEGACY_INSPECTION = {
  id: 'insp-legacy',
  status: 'completed',
  mileage: 82000,
  notes: null,
  createdAt: new Date('2025-11-02'),
  completedAt: new Date('2025-11-02'),
  // Written by the 20260816090000 backfill; every other new column is null.
  severityScale: 'basic',
  country: null,
  vehicleCategory: null,
  nextTestDue: null,
  certificateNumber: null,
  inspectorName: null,
  testLocation: null,
  vehicle: {
    make: 'Ford',
    model: 'F-150',
    year: 2021,
    vin: 'FORD123',
    licensePlate: 'TR-001',
    mileage: 82000,
    customer: { name: 'Dave Owner', email: 'dave@example.com', phone: '555-3333' },
  },
  template: { name: 'Full Inspection', severityScale: 'basic', country: null },
  items: [
    legacyItem({
      id: 'l-pass',
      name: 'Oil Level',
      section: 'Engine',
      condition: 'pass',
      notes: null,
    }),
    legacyItem(),
    legacyItem({
      id: 'l-att',
      name: 'Tire Tread',
      section: 'Tires',
      condition: 'attention',
      notes: null,
    }),
    legacyItem({
      id: 'l-none',
      name: 'Exhaust',
      section: 'Engine',
      condition: 'not_inspected',
      notes: null,
    }),
  ],
}

const WORKSHOP = {
  name: 'Quality Auto',
  address: '5 Shop Lane',
  phone: '555-2222',
  email: 'qa@example.com',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderPdf = (data: any, extra: Record<string, unknown> = {}) =>
  renderToBuffer(
    React.createElement(InspectionPDF, {
      data,
      workshop: WORKSHOP,
      ...extra,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )

describe('certificate PDF for inspections recorded before the overhaul', () => {
  it('renders a legacy inspection to a PDF', async () => {
    const buffer = await renderPdf(LEGACY_INSPECTION)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30000)

  it('renders when the scale snapshot predates the backfill', async () => {
    const buffer = await renderPdf({ ...LEGACY_INSPECTION, severityScale: null })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30000)

  it('renders an inspection that was never completed', async () => {
    const buffer = await renderPdf({
      ...LEGACY_INSPECTION,
      status: 'in_progress',
      completedAt: null,
      items: LEGACY_INSPECTION.items.map((i) => ({ ...i, condition: 'not_inspected' })),
    })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30000)

  it('renders when the customer was never linked', async () => {
    const buffer = await renderPdf({
      ...LEGACY_INSPECTION,
      vehicle: { ...LEGACY_INSPECTION.vehicle, customer: null, vin: null, licensePlate: null },
    })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  }, 30000)
})
