import { z } from 'zod'

/**
 * What an issued invoice carries with it, beyond its own rows.
 *
 * An invoice already owns its lines, amounts, dates and notes. Everything
 * else it prints was read live from somewhere that keeps changing: the
 * workshop's address and bank account, the customer's address, the vehicle,
 * the technician's name, the open findings, the custom field definitions.
 * Issuing the invoice copies those here, so the sheet the customer holds is
 * the sheet the workshop can print again in five years.
 *
 * The shape is read leniently: unknown keys pass, and everything but the
 * version is optional. A snapshot written today must still render on the
 * code of several releases from now, which will have fields this one never
 * heard of, and must never fail because one of them is missing.
 */

export const ISSUED_INVOICE_VERSION = 1

const partySchema = z
  .object({
    name: z.string(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    taxId: z.string().nullable().optional(),
    customerNumber: z.string().nullable().optional(),
  })
  .passthrough()

export const issuedInvoiceDataSchema = z
  .object({
    version: z.number().int(),
    workshop: z
      .object({
        name: z.string().default(''),
        address: z.string().default(''),
        phone: z.string().default(''),
        email: z.string().default(''),
        slogan: z.string().optional(),
      })
      .passthrough()
      .optional(),
    invoiceSettings: z
      .object({
        bankAccount: z.string().optional(),
        orgNumber: z.string().optional(),
        paymentTerms: z.string().optional(),
        footerNote: z.string().optional(),
        showBankAccount: z.boolean().optional(),
        showOrgNumber: z.boolean().optional(),
        dueDays: z.number().optional(),
        currencyCode: z.string().optional(),
        currencyFormat: z.enum(['symbol', 'code']).optional(),
        unitSystem: z.string().optional(),
        dateFormat: z.string().optional(),
        timezone: z.string().optional(),
      })
      .passthrough()
      .optional(),
    serviceType: z.string().optional(),
    taxLabel: z.string().optional(),
    customer: partySchema.nullable().optional(),
    vehicle: z
      .object({
        make: z.string(),
        model: z.string(),
        year: z.number(),
        vin: z.string().nullable().optional(),
        licensePlate: z.string().nullable().optional(),
        mileage: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    technicianName: z.string().nullable().optional(),
    findings: z
      .array(
        z
          .object({
            description: z.string(),
            severity: z.string(),
            notes: z.string().nullable().optional(),
          })
          .passthrough()
      )
      .optional(),
    customFields: z
      .array(
        z
          .object({
            fieldId: z.string(),
            label: z.string(),
            value: z.string(),
            fieldType: z.string(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough()

type ParsedIssuedInvoiceData = z.infer<typeof issuedInvoiceDataSchema>

export type IssuedInvoiceData = ParsedIssuedInvoiceData & {
  workshop: NonNullable<ParsedIssuedInvoiceData['workshop']>
  invoiceSettings: NonNullable<ParsedIssuedInvoiceData['invoiceSettings']>
}

/**
 * The stored JSON as data, or null when it cannot be trusted at all. The
 * two blocks every renderer reads are filled in when a snapshot lacks them,
 * so callers never branch on their absence.
 */
export function readIssuedInvoiceData(raw: unknown): IssuedInvoiceData | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = issuedInvoiceDataSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    workshop: parsed.data.workshop ?? { name: '', address: '', phone: '', email: '' },
    invoiceSettings: parsed.data.invoiceSettings ?? {},
  }
}

export interface IssueMarks {
  issuedAt: Date | null
  editUnlockedAt?: Date | null
}

/**
 * Whether the invoice prints from what was issued rather than from live
 * data. An unlock after the issue reopens the document: the owner is
 * correcting it, and the sheet has to show the correction while they work.
 * Issuing it again, which sending does, freezes the corrected copy.
 */
export function rendersFromIssue(record: IssueMarks & { issuedData?: unknown }): boolean {
  if (!record.issuedAt || record.issuedData == null) return false
  if (record.editUnlockedAt && record.editUnlockedAt.getTime() > record.issuedAt.getTime()) {
    return false
  }
  return true
}

/**
 * Why an invoice is being issued. Sending is a new issue whenever the
 * document could have changed; payment and the backfill of invoices that
 * went out before issuing existed only ever fill an empty slot.
 */
export type IssueReason = 'sent' | 'paid' | 'backfill'

/**
 * Whether to capture now. A locked invoice cannot have changed since its
 * last issue, so sending it again keeps the snapshot the customer already
 * has; an unlocked or never-locked one is re-issued on every send, so the
 * snapshot is always the last copy that went out. Decide this before the
 * send is stamped, because under the "lock when sent" rule the stamp itself
 * is what locks the document.
 */
export function shouldIssue(record: IssueMarks, locked: boolean, reason: IssueReason): boolean {
  if (!record.issuedAt) return true
  if (reason === 'sent') return !locked
  return false
}

/**
 * Whether an invoice that predates issuing has already reached the
 * customer, and so is owed a snapshot the first time it is printed again.
 */
export function wasIssuedBeforeTracking(record: {
  issuedAt: Date | null
  sentAt: Date | null
  manuallyPaid: boolean
  payments?: { amount: number }[]
}): boolean {
  if (record.issuedAt) return false
  return Boolean(record.sentAt || record.manuallyPaid || (record.payments?.length ?? 0) > 0)
}
