import { z } from 'zod'
import { addZonedDays } from '@/lib/timezone'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'
import type { MarkTypeRow } from '@/features/condition-map/Lib/markTypes'
import type { InspectionResults } from '@/features/inspections/Lib/inspectionResults'
import { isDefect } from '@/features/inspections/Lib/conditions'
import type {
  PrintableEquipment,
  PrintableEquipmentLists,
} from '@/features/equipment/Lib/equipmentPrint'

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
        // Absent on invoices issued before the fleet number was recorded.
        fleetNumber: z.string().nullable().optional(),
        // Absent on invoices issued before meters were recorded.
        meterReadings: z
          .array(z.object({ name: z.string(), unit: z.string(), value: z.number() }))
          .optional(),
        mileage: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    /**
     * The job's own reading, the one the mileage line prints, as it was when
     * issued; null when the job had none. Absent on invoices issued before it
     * was kept, which go on printing the job's reading as it stands.
     */
    jobMileage: z.number().nullable().optional(),
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
            /**
             * 'workshop' when the value prints in the workshop's language and
             * date format. Absent on invoices issued while every document
             * printed "Yes"/"No" and a US long date; those keep that wording.
             */
            format: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
    /**
     * The vehicle's and the customer's own custom fields as they stood when
     * issued. Absent on invoices issued before they could be printed.
     */
    recordCustomFields: z
      .array(
        z
          .object({
            fieldId: z.string(),
            label: z.string(),
            value: z.string(),
            fieldType: z.string(),
            format: z.string().optional(),
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
    /**
     * The checks of the inspection linked to the job, as they stood when
     * issued, for a design that prints Defects or All Results. Absent on
     * invoices issued before the invoice printed them, and on one whose
     * design printed neither at issue: both print none.
     *
     * Read more leniently than the rest. Every other block failing to read
     * means the snapshot cannot be trusted and the invoice falls back to
     * live rows; a results block that will not read costs only the results.
     */
    inspectionResults: z
      .object({
        severityScale: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        items: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              section: z.string(),
              sectionCode: z.string().nullable().optional(),
              code: z.string().nullable().optional(),
              condition: z.string(),
              notes: z.string().nullable().optional(),
              sortOrder: z.number().default(0),
              measuredValue: z.number().nullable().optional(),
              unit: z.string().nullable().optional(),
              textValue: z.string().nullable().optional(),
              inputType: z.string().nullable().optional(),
              /** Where a defect's photographs are stored; never the bytes. */
              imageUrls: z.array(z.string()).optional(),
            })
            .passthrough()
        ),
      })
      .passthrough()
      .nullable()
      .optional()
      .catch(null),
    /**
     * What was fitted to the vehicle when issued, both lists, unformatted:
     * the items the job worked on and everything on the vehicle. Absent on
     * invoices issued before equipment was recorded, which print none and
     * never borrow today's. Read leniently like the results: a list that
     * will not read costs only the equipment.
     */
    equipment: z
      .object({
        job: z.array(frozenEquipmentSchema()),
        vehicle: z.array(frozenEquipmentSchema()),
      })
      .passthrough()
      .nullable()
      .optional()
      .catch(null),
    /**
     * The invoice date this issue wrote, as an ISO instant, when the date was
     * the app's and not somebody's choice. A later update to today's details
     * moves a date that still matches it and keeps one edited since. Null or
     * absent when the date was set by hand, or on invoices issued before
     * issuing dated them.
     */
    autoInvoiceDate: z.string().nullable().optional().catch(null),
    /**
     * The due date this issue wrote from the payment terms, the same way:
     * null or absent when somebody set it, or the terms gave none.
     */
    autoInvoiceDueDate: z.string().nullable().optional().catch(null),
  })
  .passthrough()

/** One item of the frozen equipment, read leniently. */
function frozenEquipmentSchema() {
  return z
    .object({
      type: z.string(),
      make: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      serialNumber: z.string().nullable().optional(),
      manufactureYear: z.number().nullable().optional(),
      installDate: z.string().nullable().optional(),
      ratedCapacity: z.string().nullable().optional(),
      nextExaminationDue: z.string().nullable().optional(),
      lastExaminedAt: z.string().nullable().optional(),
      certificateReference: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      meters: z
        .array(z.object({ name: z.string(), unit: z.string(), value: z.number() }))
        .optional(),
    })
    .passthrough()
}

type FrozenEquipment = NonNullable<z.infer<typeof issuedInvoiceDataSchema>['equipment']>

/**
 * The equipment as the snapshot keeps it, field by field: an item edited or
 * taken off the vehicle later leaves a sent invoice as it went out. Null when
 * there was none, so an invoice without equipment stores nothing for it.
 */
export function freezeEquipment(
  lists: PrintableEquipmentLists | null | undefined
): FrozenEquipment | null {
  if (!lists || (lists.job.length === 0 && lists.vehicle.length === 0)) return null
  const item = (e: PrintableEquipment): FrozenEquipment['job'][number] => ({
    type: e.type,
    make: e.make,
    model: e.model,
    serialNumber: e.serialNumber,
    manufactureYear: e.manufactureYear,
    installDate: e.installDate,
    ratedCapacity: e.ratedCapacity,
    nextExaminationDue: e.nextExaminationDue,
    lastExaminedAt: e.lastExaminedAt,
    certificateReference: e.certificateReference,
    notes: e.notes,
    meters: e.meters.map((m) => ({ name: m.name, unit: m.unit, value: m.value })),
  })
  return { job: lists.job.map(item), vehicle: lists.vehicle.map(item) }
}

/**
 * The frozen equipment in the shape the print reads. An invoice issued
 * before equipment was recorded has none, and never borrows today's.
 */
export function thawEquipment(frozen: FrozenEquipment | null | undefined): PrintableEquipmentLists {
  const item = (e: FrozenEquipment['job'][number]): PrintableEquipment => ({
    type: e.type,
    make: e.make ?? null,
    model: e.model ?? null,
    serialNumber: e.serialNumber ?? null,
    manufactureYear: e.manufactureYear ?? null,
    installDate: e.installDate ?? null,
    ratedCapacity: e.ratedCapacity ?? null,
    nextExaminationDue: e.nextExaminationDue ?? null,
    lastExaminedAt: e.lastExaminedAt ?? null,
    certificateReference: e.certificateReference ?? null,
    notes: e.notes ?? null,
    meters: e.meters ?? [],
  })
  return { job: (frozen?.job ?? []).map(item), vehicle: (frozen?.vehicle ?? []).map(item) }
}

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

type FrozenInspectionResults = NonNullable<
  z.infer<typeof issuedInvoiceDataSchema>['inspectionResults']
>

/**
 * The linked inspection's checks as the snapshot keeps them: every check, the
 * ungraded ones too, since a design may print the whole checklist. A check
 * graded, renamed or removed later leaves a sent invoice as it went out.
 *
 * The photographs are kept as the places they are stored, and only for the
 * defects, the one kind of row that prints them. Like the job's own pictures
 * they are not copied into the invoice: the print reads them again, and one
 * that has been deleted since is simply not there.
 */
export function freezeInspectionResults(
  results: InspectionResults | null | undefined
): FrozenInspectionResults | null {
  if (!results || results.items.length === 0) return null
  return {
    severityScale: results.severityScale,
    country: results.country,
    items: results.items.map((item) => ({
      id: item.id,
      name: item.name,
      section: item.section,
      sectionCode: item.sectionCode ?? null,
      code: item.code ?? null,
      condition: item.condition,
      notes: item.notes ?? null,
      sortOrder: item.sortOrder,
      measuredValue: item.measuredValue ?? null,
      unit: item.unit ?? null,
      textValue: item.textValue ?? null,
      inputType: item.inputType ?? null,
      ...(isDefect(item.condition) && item.imageUrls?.length
        ? { imageUrls: [...item.imageUrls] }
        : {}),
    })),
  }
}

/**
 * The frozen checks in the shape the print reads, without their photographs,
 * which the assembler embeds for a design that shows them. An invoice issued
 * without results has none, and never borrows today's.
 */
export function thawInspectionResults(
  frozen: FrozenInspectionResults | null | undefined
): InspectionResults | null {
  if (!frozen || frozen.items.length === 0) return null
  return {
    severityScale: frozen.severityScale === 'basic' ? 'basic' : 'eu',
    country: frozen.country ?? null,
    items: frozen.items.map((item) => ({
      id: item.id,
      name: item.name,
      section: item.section,
      sectionCode: item.sectionCode ?? null,
      code: item.code ?? null,
      condition: item.condition,
      notes: item.notes ?? null,
      sortOrder: item.sortOrder,
      measuredValue: item.measuredValue ?? null,
      unit: item.unit ?? null,
      textValue: item.textValue ?? null,
      inputType: item.inputType ?? null,
      imageUrls: item.imageUrls ?? [],
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

/**
 * The invoice date an issue writes, and what it records as the app's own.
 *
 * An invoice is dated the day it is issued, not the day the job was opened:
 * that is the date of issue VAT law asks for, and what a customer expects on
 * a job opened in one month and invoiced in the next. So a draft carries no
 * invoice date of its own until it is issued, and the first issue writes the
 * workshop's day. A date somebody typed is theirs and is kept.
 *
 * `redate` is the deliberate update to today's details: it moves a date the
 * previous issue wrote and nobody has touched since, and still keeps one set
 * by hand. A re-send after an owner's unlock does not redate: the corrected
 * copy goes out as the same invoice, under the same date.
 *
 * `write` is undefined when the row's date stays as it is. `auto` is what
 * the snapshot records: the app's date, or null when the date is a person's.
 */
export function invoiceDateAtIssue(opts: {
  current: Date | null | undefined
  previousAuto: string | null | undefined
  today: Date
  redate: boolean
}): { write?: Date; auto: string | null } {
  const { current, previousAuto, today, redate } = opts
  if (!current) return { write: today, auto: today.toISOString() }
  const untouched =
    !!previousAuto && new Date(previousAuto).getTime() === new Date(current).getTime()
  if (!untouched) return { auto: null }
  if (redate) return { write: today, auto: today.toISOString() }
  return { auto: previousAuto }
}

/**
 * The due date an issue writes, and what it records as the app's own.
 *
 * Reports, the portal, reminders and the books read the stored due date, so
 * an issued invoice carries one: the invoice date it ends up with plus the
 * payment terms, on the workshop's calendar. The same rules as the invoice
 * date: a due date somebody set is kept, and the update to today's details
 * moves only one the app wrote and nobody has changed since, and clears it
 * when the terms are now none. No terms at the first issue, no due date.
 * `write` undefined leaves the row's due date as it is; null clears it.
 */
export function dueDateAtIssue(opts: {
  current: Date | null | undefined
  previousAuto: string | null | undefined
  /** The invoice date after this issue; null when it has none. */
  invoiceDate: Date | null | undefined
  dueDays: number
  timeZone: string
  redate: boolean
}): { write?: Date | null; auto: string | null } {
  const { current, previousAuto, invoiceDate, dueDays, timeZone, redate } = opts
  const fromTerms = () =>
    invoiceDate && dueDays > 0 ? addZonedDays(new Date(invoiceDate), dueDays, timeZone) : null
  if (!current) {
    const due = fromTerms()
    return due ? { write: due, auto: due.toISOString() } : { auto: null }
  }
  const untouched =
    !!previousAuto && new Date(previousAuto).getTime() === new Date(current).getTime()
  if (!untouched) return { auto: null }
  if (!redate) return { auto: previousAuto }
  // The app's due date follows the terms as they are now; terms since set
  // to none take it away rather than leave a date nobody chose.
  const due = fromTerms()
  return due ? { write: due, auto: due.toISOString() } : { write: null, auto: null }
}

/**
 * Whether an invoice being issued now had already gone out before issuing
 * tracked it: sent, or paid, on a date the customer already holds. Such an
 * invoice is frozen as it is and its dates are left alone; only one that is
 * issued for the first time on this occasion is dated by it.
 *
 * Differs from wasIssuedBeforeTracking only in what this occasion did itself:
 * a payment issues the invoice after it is written, so the payment (or the
 * paid mark) that triggered this issue is not evidence of an earlier one.
 * Sending issues before it stamps, so a sentAt is always an earlier send.
 */
export function wentOutBeforeIssue(
  record: {
    issuedAt: Date | null
    sentAt: Date | null
    manuallyPaid: boolean
    payments?: { id?: string }[]
  },
  reason: IssueReason
): boolean {
  if (record.issuedAt) return false
  if (record.sentAt) return true
  const payments = record.payments?.length ?? 0
  if (reason === 'paid') return payments > 1 || (payments > 0 && record.manuallyPaid)
  return record.manuallyPaid || payments > 0
}
