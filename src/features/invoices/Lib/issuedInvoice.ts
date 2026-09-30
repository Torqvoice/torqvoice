import { z } from 'zod'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'
import type { MarkTypeRow } from '@/features/condition-map/Lib/markTypes'

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
        // Absent on invoices issued before the type key was recorded.
        hsn: z.string().nullable().optional(),
        tsn: z.string().nullable().optional(),
        mileage: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    technicianName: z.string().nullable().optional(),
    /** Who signed the sheet; the signature itself is issuedSignatureSnapshot. */
    signerName: z.string().nullable().optional(),
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
    /**
     * The car's condition this visit, as it was when issued. Absent on
     * invoices issued before the invoice printed it, which print none.
     */
    conditionMap: z
      .object({
        bodyType: z.string().nullable().optional(),
        /** The job's own answer at issue; absent before the switch existed. */
        onInvoice: z.boolean().nullable().optional(),
        /** The workshop's kinds of mark at issue; absent before they could be changed. */
        types: z
          .array(
            z
              .object({
                key: z.string(),
                name: z.string(),
                shape: z.string(),
                color: z.string(),
                sortOrder: z.number().default(0),
                hidden: z.boolean().default(false),
              })
              .passthrough()
          )
          .nullable()
          .optional(),
        marks: z.array(
          z
            .object({
              id: z.string(),
              bodyType: z.string(),
              view: z.string(),
              panel: z.string(),
              x: z.number(),
              y: z.number(),
              kind: z.string(),
              severity: z.string(),
              note: z.string().nullable().optional(),
              recordedAt: z.string(),
            })
            .passthrough()
        ),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

/** The car's condition this visit, as an invoice prints it, and whether this job asked for it. */
export type InvoiceConditionMap = {
  marks: ConditionMarkData[]
  bodyType: string | null
  /** The job's own answer, or null to follow the design. */
  onInvoice: boolean | null
  /**
   * The workshop's changes to the kinds of mark, as they were at issue:
   * a kind renamed later leaves a sent invoice as it went out. Null on an
   * invoice issued before kinds could be changed, which prints the app's own.
   */
  types?: MarkTypeRow[] | null
}

type FrozenConditionMap = NonNullable<z.infer<typeof issuedInvoiceDataSchema>['conditionMap']>

/**
 * This visit's marks as the snapshot keeps them: where each was and what it
 * said, so clearing a dent as repaired later does not change a sent invoice.
 */
export function freezeConditionMap(
  map: InvoiceConditionMap | null | undefined
): FrozenConditionMap | null {
  if (!map || map.marks.length === 0) return null
  return {
    bodyType: map.bodyType,
    onInvoice: map.onInvoice,
    types: (map.types ?? []).map(({ key, name, shape, color, sortOrder, hidden }) => ({
      key,
      name,
      shape,
      color,
      sortOrder,
      hidden,
    })),
    marks: map.marks.map((m) => ({
      id: m.id,
      bodyType: m.bodyType,
      view: m.view,
      panel: m.panel,
      x: m.x,
      y: m.y,
      kind: m.kind,
      severity: m.severity,
      note: m.note,
      recordedAt: new Date(m.recordedAt).toISOString(),
    })),
  }
}

/**
 * The frozen marks in the shape the print reads. An invoice issued before it
 * printed the map has none, and never borrows today's marks.
 */
export function thawConditionMap(
  frozen: FrozenConditionMap | null | undefined
): InvoiceConditionMap | null {
  if (!frozen || frozen.marks.length === 0) return null
  return {
    bodyType: frozen.bodyType ?? null,
    onInvoice: frozen.onInvoice ?? null,
    types: frozen.types ?? null,
    marks: frozen.marks.map((m) => ({
      id: m.id,
      vehicleId: '',
      inspectionId: null,
      inspectionItemId: null,
      serviceRecordId: null,
      bodyType: m.bodyType,
      view: m.view,
      panel: m.panel,
      x: m.x,
      y: m.y,
      kind: m.kind,
      severity: m.severity,
      note: m.note ?? null,
      imageUrls: [],
      recordedAt: m.recordedAt,
      resolvedAt: null,
    })),
  }
}

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
 * Whether an owner has reopened the document since it was issued. An unlock
 * is the one deliberate act that says "this copy is being corrected"; nothing
 * else, and in particular not sending, reopens an issued invoice.
 */
export function reopenedSinceIssue(record: IssueMarks): boolean {
  return Boolean(
    record.issuedAt &&
      record.editUnlockedAt &&
      record.editUnlockedAt.getTime() > record.issuedAt.getTime()
  )
}

/**
 * Whether the invoice prints from what was issued rather than from live
 * data. While an unlock is newer than the issue the owner is correcting the
 * document, and the sheet has to show the correction as they work; sending
 * it again then issues the corrected copy and freezes it once more.
 */
export function rendersFromIssue(record: IssueMarks & { issuedData?: unknown }): boolean {
  if (!record.issuedAt || record.issuedData == null) return false
  return !reopenedSinceIssue(record)
}

/**
 * Why an invoice is being issued. Sending issues a document that was never
 * issued, or one an owner reopened; payment, and the freeze a workshop asks
 * for on invoices that went out before issuing existed, only ever fill an
 * empty slot.
 */
export type IssueReason = 'sent' | 'paid' | 'backfill'

/**
 * Whether to capture now. An issued invoice keeps its snapshot through every
 * later send: the customer already holds that copy, and a preview and a
 * re-send must show the same sheet whatever the workshop has changed since.
 * The one way to a fresh capture is an owner's unlock followed by a send,
 * which is the corrected copy going out. The lock setting plays no part, so
 * a workshop that never turned locking on gets the same guarantee.
 */
export function shouldIssue(record: IssueMarks, reason: IssueReason): boolean {
  if (!record.issuedAt) return true
  if (reason === 'sent') return reopenedSinceIssue(record)
  return false
}

/**
 * Whether an invoice that predates issuing has already reached the
 * customer, and so prints from live rows that may since have changed. These
 * are what invoice settings counts and offers to freeze.
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
