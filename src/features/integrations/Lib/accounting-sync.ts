/**
 * What every accounting connector shares.
 *
 * An invoice, a customer and a payment are loaded here in one shape, so a
 * ledger connector maps that shape to its vendor and never reads Prisma. The
 * loaders are scoped to the connection's organisation, and the writers only
 * ever touch what a pull brought back from the ledger: a payment recorded
 * there against an invoice this app issued.
 */

import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { effectiveInvoiceDate } from '@/lib/invoice-utils'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { serviceUrl } from './calendar-sync'

export const INVOICE_ENTITY = 'ServiceRecord'
export const CUSTOMER_ENTITY = 'Customer'
export const PAYMENT_ENTITY = 'Payment'

export interface AccountingCustomer {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  company: string | null
  taxId: string | null
  taxExempt: boolean
  customerNumber: string | null
}

export interface AccountingLine {
  kind: 'labor' | 'part'
  description: string
  partNumber: string | null
  quantity: number
  unitPrice: number
  total: number
}

export interface AccountingPayment {
  id: string
  serviceRecordId: string
  amount: number
  date: Date
  method: string
  note: string | null
  provider: string | null
  externalId: string | null
}

export interface AccountingInvoice {
  id: string
  vehicleId: string | null
  invoiceNumber: string | null
  status: string
  issuedAt: Date | null
  /** The date the sheet prints, which is the date the ledger should carry. */
  invoiceDate: Date
  /** When the work was done, for the service date on each line. */
  serviceDate: Date
  dueDate: Date | null
  mileage: number | null
  notes: string | null
  subtotal: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  taxInclusive: boolean
  totalAmount: number
  manuallyPaid: boolean
  customer: AccountingCustomer | null
  vehicle: { year: number; make: string; model: string; licensePlate: string | null } | null
  lines: AccountingLine[]
  payments: AccountingPayment[]
}

const customerSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  company: true,
  taxId: true,
  taxExempt: true,
  customerNumber: true,
} as const

export async function loadCustomerForAccounting(
  organizationId: string,
  customerId: string
): Promise<AccountingCustomer | null> {
  return db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: customerSelect,
  })
}

/**
 * The invoice as the ledger needs it. The customer is the record's own or,
 * for a job on a vehicle, the vehicle's; a counter sale can have neither.
 */
export async function loadInvoiceForAccounting(
  organizationId: string,
  serviceRecordId: string
): Promise<AccountingInvoice | null> {
  const r = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: {
      id: true,
      vehicleId: true,
      invoiceNumber: true,
      status: true,
      issuedAt: true,
      sentAt: true,
      invoiceDate: true,
      startDateTime: true,
      serviceDate: true,
      invoiceDueDate: true,
      mileage: true,
      invoiceNotes: true,
      subtotal: true,
      discountType: true,
      discountValue: true,
      discountAmount: true,
      taxRate: true,
      taxAmount: true,
      taxInclusive: true,
      totalAmount: true,
      cost: true,
      manuallyPaid: true,
      customer: { select: customerSelect },
      vehicle: {
        select: {
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          customer: { select: customerSelect },
        },
      },
      laborItems: {
        select: {
          description: true,
          hours: true,
          rate: true,
          total: true,
          pricingType: true,
        },
      },
      partItems: {
        select: { partNumber: true, name: true, quantity: true, unitPrice: true, total: true },
      },
      payments: {
        select: {
          id: true,
          serviceRecordId: true,
          amount: true,
          date: true,
          method: true,
          note: true,
          provider: true,
          externalId: true,
        },
        orderBy: { date: 'asc' },
      },
    },
  })
  if (!r) return null
  const lines: AccountingLine[] = [
    ...r.laborItems.map((l) => {
      const hourly = l.pricingType === 'hourly' && l.hours > 0
      return {
        kind: 'labor' as const,
        description: l.description,
        partNumber: null,
        quantity: hourly ? l.hours : 1,
        unitPrice: hourly ? l.rate : l.total,
        total: l.total,
      }
    }),
    ...r.partItems.map((p) => ({
      kind: 'part' as const,
      description: p.name,
      partNumber: p.partNumber,
      quantity: p.quantity > 0 ? p.quantity : 1,
      unitPrice: p.quantity > 0 ? p.unitPrice : p.total,
      total: p.total,
    })),
  ]
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    issuedAt: issuedAtOf(r),
    invoiceDate: effectiveInvoiceDate(r),
    serviceDate: r.serviceDate,
    dueDate: r.invoiceDueDate,
    mileage: r.mileage,
    notes: r.invoiceNotes,
    subtotal: r.subtotal,
    discountType: r.discountType,
    discountValue: r.discountValue,
    discountAmount: r.discountAmount,
    taxRate: r.taxRate,
    taxAmount: r.taxAmount,
    taxInclusive: r.taxInclusive,
    // Records from before itemised totals carry the amount in cost only.
    totalAmount: r.totalAmount > 0 ? r.totalAmount : r.cost,
    manuallyPaid: r.manuallyPaid,
    customer: r.customer ?? r.vehicle?.customer ?? null,
    vehicle: r.vehicle
      ? {
          year: r.vehicle.year,
          make: r.vehicle.make,
          model: r.vehicle.model,
          licensePlate: r.vehicle.licensePlate,
        }
      : null,
    lines,
    payments: r.payments,
  }
}

export function invoiceUrl(appUrl: string, invoice: Pick<AccountingInvoice, 'id' | 'vehicleId'>) {
  return serviceUrl(appUrl, invoice)
}

export async function loadPaymentForAccounting(
  organizationId: string,
  paymentId: string
): Promise<AccountingPayment | null> {
  return db.payment.findFirst({
    where: { id: paymentId, serviceRecord: { organizationId } },
    select: {
      id: true,
      serviceRecordId: true,
      amount: true,
      date: true,
      method: true,
      note: true,
      provider: true,
      externalId: true,
    },
  })
}

/** ISO 4217 code the workshop prices in, or null when it never chose one. */
export async function workshopCurrency(organizationId: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.CURRENCY_CODE } },
    select: { value: true },
  })
  const code = row?.value?.trim().toUpperCase()
  return code && /^[A-Z]{3}$/.test(code) ? code : null
}

export interface PulledPaymentInput {
  serviceRecordId: string
  amount: number
  date: Date
  /** One of the app's own methods: cash, card, transfer or other. */
  method: string
  provider: string
  externalId: string
  note: string | null
}

/**
 * A payment the ledger has and this app did not: recorded against the
 * invoice so the balance here matches the books. The provider and remote id
 * make it idempotent; a second pull of the same payment returns the row the
 * first one made. Money against an invoice issues it, the same as a payment
 * typed in by hand.
 */
export async function recordPulledPayment(
  organizationId: string,
  input: PulledPaymentInput
): Promise<{ id: string; created: boolean } | null> {
  const record = await db.serviceRecord.findFirst({
    where: { id: input.serviceRecordId, organizationId },
    select: { id: true },
  })
  if (!record) return null
  const existing = await db.payment.findFirst({
    where: {
      serviceRecordId: input.serviceRecordId,
      provider: input.provider,
      externalId: input.externalId,
    },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }
  const created = await db.payment.create({
    data: {
      serviceRecordId: input.serviceRecordId,
      amount: input.amount,
      date: input.date,
      method: input.method,
      note: input.note,
      provider: input.provider,
      externalId: input.externalId,
    },
    select: { id: true },
  })
  const { issueInvoice } = await import('@/features/invoices/Lib/issueInvoice')
  await issueInvoice(input.serviceRecordId, organizationId, 'paid')
  return { id: created.id, created: true }
}

/** Undo a pulled payment the ledger has since deleted. Only rows a pull made are touched. */
export async function removePulledPayment(
  organizationId: string,
  paymentId: string,
  provider: string
): Promise<boolean> {
  const r = await db.payment.deleteMany({
    where: { id: paymentId, provider, serviceRecord: { organizationId } },
  })
  return r.count > 0
}

/**
 * When the invoice reached the customer, which is when the ledger should have
 * it. Invoices issued since locking exists carry the stamp. Older ones were
 * sent, marked paid or paid before the stamp existed and never got one unless
 * the workshop locked them from invoice settings; for the ledger they count
 * as issued all the same, dated by the send or the first payment.
 */
export function issuedAtOf(r: {
  issuedAt: Date | null
  sentAt: Date | null
  manuallyPaid: boolean
  payments: { date: Date }[]
  invoiceDate: Date | null
  serviceDate: Date
}): Date | null {
  if (r.issuedAt) return r.issuedAt
  if (r.sentAt) return r.sentAt
  if (r.payments.length > 0) return r.payments[0].date
  if (r.manuallyPaid) return r.invoiceDate ?? r.serviceDate
  return null
}

/** Rows that count as issued for the ledger, mirroring issuedAtOf. */
const ISSUED_WHERE: Prisma.ServiceRecordWhereInput = {
  OR: [
    { issuedAt: { not: null } },
    { sentAt: { not: null } },
    { manuallyPaid: true },
    { payments: { some: {} } },
  ],
}

/**
 * Every issued invoice, oldest first, for a fresh connection to push. The
 * date filter is coarse (the sheet's own date, or the service date without
 * one); the connector applies the workshop's start date exactly, in its
 * timezone, when each job runs.
 */
export async function invoicesForBackfill(
  organizationId: string,
  since: Date | null,
  limit = 5000
): Promise<string[]> {
  const rows = await db.serviceRecord.findMany({
    where: {
      organizationId,
      invoiceNumber: { not: null },
      AND: [
        ISSUED_WHERE,
        ...(since
          ? [
              {
                OR: [
                  { invoiceDate: { gte: since } },
                  { invoiceDate: null, serviceDate: { gte: since } },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  return rows.map((r) => r.id)
}
