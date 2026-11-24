/**
 * What a page opened from a share link hands to the browser.
 *
 * A prop given to a client component is serialised into the page, whether or
 * not anything draws it, so anyone holding the link can read every field of
 * it. Each mapper here names the fields its view draws and copies those, one
 * by one. A field that is not listed does not leave the server: a column
 * added to a table tomorrow stays out until somebody adds it here on purpose.
 *
 * Never spread a database row into one of these. The tests in
 * `src/__tests__/app/share/public-payload.test.tsx` fill every column of a
 * row with a marker and fail when one shows up in what a page sends.
 */

import { normalizeFleetNumber } from '@/features/vehicles/Lib/fleetNumber'

/**
 * Turns a stored upload address into the one this link's token opens. Each
 * page brings its own, because each has rewritten a different set of forms.
 */
export type ToPublicUrl = (fileUrl: string) => string

/* ── Invoice ─────────────────────────────────────────────────────────── */

export interface PublicInvoiceRecord {
  id: string
  invoiceNumber: string | null
  /** True for an invoice the workshop cancelled: nothing is owed, nothing is paid online. */
  cancelled?: boolean
  shopName: string | null
  serviceDate: Date
  startDateTime: Date | null
  invoiceDate: Date | null
  taxRate: number
  taxInclusive?: boolean
  totalAmount: number
  cost: number
  manuallyPaid: boolean
  discountType: string | null
  discountValue: number
  discountAmount: number
  partItems: { total: number; taxable?: boolean | null }[]
  laborItems: { total: number; taxable?: boolean | null }[]
  payments: { amount: number }[]
  attachments: PublicAttachment[]
  vehicle: { make: string; model: string; year: number } | null
}

export interface PublicAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  description: string | null
}

type InvoiceSource = Omit<PublicInvoiceRecord, 'attachments' | 'vehicle' | 'cancelled'> & {
  status?: string
  attachments: (PublicAttachment & { includeInInvoice?: boolean | null })[]
}

/**
 * The invoice as the share page's own chrome needs it: the amounts the pay
 * buttons work from, the number in the file name and the files the workshop
 * attached for the customer. The sheet itself arrives as a finished spec.
 */
export function publicInvoiceRecord(
  record: InvoiceSource,
  vehicle: { make: string; model: string; year: number } | null | undefined,
  toPublicUrl: ToPublicUrl
): PublicInvoiceRecord {
  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber,
    cancelled: record.status === 'cancelled',
    shopName: record.shopName,
    serviceDate: record.serviceDate,
    startDateTime: record.startDateTime,
    invoiceDate: record.invoiceDate,
    taxRate: record.taxRate,
    taxInclusive: record.taxInclusive,
    totalAmount: record.totalAmount,
    cost: record.cost,
    manuallyPaid: record.manuallyPaid,
    discountType: record.discountType,
    discountValue: record.discountValue,
    discountAmount: record.discountAmount,
    partItems: record.partItems.map((part) => ({ total: part.total, taxable: part.taxable })),
    laborItems: record.laborItems.map((line) => ({ total: line.total, taxable: line.taxable })),
    payments: record.payments.map((payment) => ({ amount: payment.amount })),
    attachments: record.attachments
      .filter((file) => file.includeInInvoice !== false)
      .map((file) => publicAttachment(file, toPublicUrl)),
    vehicle: vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year } : null,
  }
}

export function publicAttachment(
  file: PublicAttachment,
  toPublicUrl: ToPublicUrl
): PublicAttachment {
  return {
    id: file.id,
    fileName: file.fileName,
    fileUrl: toPublicUrl(file.fileUrl),
    fileType: file.fileType,
    description: file.description,
  }
}

/* ── Quote ───────────────────────────────────────────────────────────── */

const PUBLIC_QUOTE_PARTY = {
  name: true,
  email: true,
  phone: true,
  address: true,
  company: true,
  taxId: true,
} as const

/**
 * The columns of a quote a customer's copy is built from, for the share page
 * and the portal alike. The sheet prints `description`, the note written for
 * the customer. `notes` is the workshop's own and is not read at all, and
 * neither is a line's cost or markup.
 */
export const PUBLIC_QUOTE_SELECT = {
  id: true,
  quoteNumber: true,
  title: true,
  description: true,
  status: true,
  validUntil: true,
  createdAt: true,
  sentAt: true,
  // The customer's own reference / PO. Their number, so theirs to see; taken
  // away again by the caller for a workshop that has the field off.
  customerReference: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  taxInclusive: true,
  taxComponents: true,
  taxableSubtotal: true,
  discountType: true,
  discountValue: true,
  discountAmount: true,
  totalAmount: true,
  warrantyStatus: true,
  warrantyMonths: true,
  warrantyMileage: true,
  warrantyNotes: true,
  // Whose signature the sheet carries, and which car and inspection it reads.
  userId: true,
  vehicleId: true,
  // Whose custom fields a design may place on the sheet; never sent as it is.
  customerId: true,
  inspectionId: true,
  partItems: {
    select: {
      id: true,
      partNumber: true,
      name: true,
      quantity: true,
      unit: true,
      category: true,
      unitPrice: true,
      total: true,
      excluded: true,
      // The sheet works its tax out from the lines, so each has to say
      // whether it is taxed; left out here, every line would be.
      taxable: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  laborItems: {
    select: {
      id: true,
      description: true,
      hours: true,
      rate: true,
      total: true,
      pricingType: true,
      excluded: true,
      taxable: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  customer: { select: PUBLIC_QUOTE_PARTY },
  vehicle: {
    select: {
      make: true,
      model: true,
      year: true,
      vin: true,
      licensePlate: true,
      hsn: true,
      tsn: true,
      // Taken away again by the caller for a workshop that has the field off.
      fleetNumber: true,
    },
  },
} as const

export interface PublicQuoteRecord {
  id: string
  quoteNumber: string | null
  status: string
  validUntil: Date | null
  createdAt: Date
}

/** The quote as the share page's own chrome needs it; the sheet arrives as a finished spec. */
export function publicQuoteRecord(quote: PublicQuoteRecord): PublicQuoteRecord {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
  }
}

/* ── Inspection ──────────────────────────────────────────────────────── */

export interface PublicInspectionItem {
  id: string
  name: string
  section: string
  sectionCode?: string | null
  code?: string | null
  sortOrder: number
  condition: string
  notes: string | null
  imageUrls: string[]
  inputType?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  measuredValue?: number | null
  textValue?: string | null
}

export interface PublicInspectionVehicle {
  make: string
  model: string
  year: number
  vin: string | null
  licensePlate: string | null
  /** Null unless the workshop records the German type key. */
  hsn?: string | null
  tsn?: string | null
  /**
   * Only on a vehicle that has one, for a workshop that has the field on (the
   * caller gates it): otherwise there is no key at all.
   */
  fleetNumber?: string | null
  mileage: number
  customer: { name: string } | null
}

export interface PublicInspection {
  id: string
  mileage: number | null
  notes: string | null
  completedAt: Date | null
  createdAt: Date
  severityScale?: string | null
  country?: string | null
  vehicleCategory?: string | null
  nextTestDue?: Date | null
  certificateNumber?: string | null
  inspectorName?: string | null
  testLocation?: string | null
  vehicle: PublicInspectionVehicle
  template: { name: string; severityScale?: string | null; country?: string | null }
  items: PublicInspectionItem[]
  /** Files on the inspection as a whole that the workshop chose to show. */
  attachments?: PublicAttachment[]
}

type InspectionSource = Omit<PublicInspection, 'attachments'> & {
  attachments: (PublicAttachment & { includeInReport?: boolean | null })[]
}

/**
 * The inspection as the report page draws it: the checks with their grades,
 * notes and photographs, the car, and the files the workshop chose to show.
 * The guidance an inspector reads beside a check is theirs and stays behind.
 */
export function publicInspection(
  inspection: InspectionSource,
  toPublicUrl: ToPublicUrl
): PublicInspection & { attachments: PublicAttachment[] } {
  const { vehicle, template } = inspection
  const fleetNumber = normalizeFleetNumber(vehicle.fleetNumber)
  return {
    id: inspection.id,
    mileage: inspection.mileage,
    notes: inspection.notes,
    completedAt: inspection.completedAt,
    createdAt: inspection.createdAt,
    severityScale: inspection.severityScale,
    country: inspection.country,
    vehicleCategory: inspection.vehicleCategory,
    nextTestDue: inspection.nextTestDue,
    certificateNumber: inspection.certificateNumber,
    inspectorName: inspection.inspectorName,
    testLocation: inspection.testLocation,
    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      hsn: vehicle.hsn ?? null,
      tsn: vehicle.tsn ?? null,
      ...(fleetNumber ? { fleetNumber } : {}),
      mileage: vehicle.mileage,
      customer: vehicle.customer ? { name: vehicle.customer.name } : null,
    },
    template: {
      name: template.name,
      severityScale: template.severityScale,
      country: template.country,
    },
    items: inspection.items.map((item) => ({
      id: item.id,
      name: item.name,
      section: item.section,
      sectionCode: item.sectionCode,
      code: item.code,
      sortOrder: item.sortOrder,
      condition: item.condition,
      notes: item.notes,
      imageUrls: item.imageUrls.map(toPublicUrl),
      inputType: item.inputType,
      unit: item.unit,
      minValue: item.minValue,
      maxValue: item.maxValue,
      measuredValue: item.measuredValue,
      textValue: item.textValue,
    })),
    attachments: inspection.attachments
      .filter((file) => file.includeInReport !== false)
      .map((file) => publicAttachment(file, toPublicUrl)),
  }
}
