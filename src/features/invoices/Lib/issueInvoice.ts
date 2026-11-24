import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveWorkshopTimeZone, startOfZonedDay } from '@/lib/timezone'
import type { Prisma } from '@/generated/prisma/client'
import {
  ensureAssetSnapshot,
  ensureDesignSnapshot,
} from '@/features/invoice-designer/Lib/designSnapshots'
import { assembleInvoicePrint, type InvoicePrintAssembly } from './assembleInvoicePrint'
import { ISSUE_PHOTO_WAIT_MS } from '@/features/invoice-designer/Lib/vehiclePhoto.server'
import {
  freezeConditionMap,
  freezeEquipment,
  freezeInspectionResults,
  dueDateAtIssue,
  invoiceDateAtIssue,
  ISSUED_INVOICE_VERSION,
  readIssuedInvoiceData,
  shouldIssue,
  wentOutBeforeIssue,
  type IssueReason,
  type IssuedInvoiceData,
} from './issuedInvoice'

/** The part of an assembly the record does not own, as the snapshot keeps it. */
export function buildIssuedInvoiceData(a: InvoicePrintAssembly): IssuedInvoiceData {
  const customer = a.data.customer ?? a.data.vehicle?.customer ?? null
  return {
    version: ISSUED_INVOICE_VERSION,
    workshop: { ...a.workshop },
    invoiceSettings: { ...a.invoiceSettings },
    serviceType: a.serviceType,
    taxLabel: a.taxLabel,
    customer: customer
      ? {
          name: customer.name,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
          address: customer.address ?? null,
          company: customer.company ?? null,
          taxId: customer.taxId ?? null,
          customerNumber: customer.customerNumber ?? null,
        }
      : null,
    vehicle: a.data.vehicle
      ? {
          make: a.data.vehicle.make,
          model: a.data.vehicle.model,
          year: a.data.vehicle.year,
          vin: a.data.vehicle.vin,
          licensePlate: a.data.vehicle.licensePlate,
          hsn: a.data.vehicle.hsn ?? null,
          tsn: a.data.vehicle.tsn ?? null,
          fleetNumber: a.data.vehicle.fleetNumber ?? null,
          // Raw values: they print in the workshop's number format as it is
          // at print time, like the custom fields frozen beside them.
          meterReadings: (a.data.vehicle.meterReadings ?? []).map((meter) => ({
            name: meter.name,
            unit: meter.unit,
            value: meter.value,
          })),
          mileage: a.data.vehicle.mileage,
        }
      : null,
    // The check-in on a phone, or a later save, can change the job's reading
    // after the invoice has gone out; the sheet keeps the one it went out with.
    jobMileage: a.data.mileage ?? null,
    technicianName: a.data.technician?.name || a.data.techName || null,
    signerName: a.signer.name || null,
    findings: (a.data.findings ?? []).map((f) => ({
      description: f.description,
      severity: f.severity,
      notes: f.notes ?? null,
    })),
    customFields: (a.data.customFields ?? []).map((cf) => ({
      fieldId: cf.fieldId,
      label: cf.label,
      value: cf.value,
      fieldType: cf.fieldType,
      format: 'workshop',
    })),
    recordCustomFields: (a.data.recordCustomFields ?? []).map((cf) => ({
      fieldId: cf.fieldId,
      label: cf.label,
      value: cf.value,
      fieldType: cf.fieldType,
      format: 'workshop',
    })),
    conditionMap: freezeConditionMap(a.conditionMap),
    inspectionResults: freezeInspectionResults(a.inspectionResults),
    // Both lists as they stood, so a design reapplied later can print either.
    equipment: freezeEquipment(a.data.equipment),
  }
}

/**
 * How an issue treats the invoice date. `ifUnset` dates an invoice that has
 * no date yet to the workshop's today; `redate` also moves a date the last
 * issue wrote; `keep` never touches it (the backfill of invoices the
 * customer already holds, dated as they were sent).
 */
type InvoiceDating = 'ifUnset' | 'redate' | 'keep'

/**
 * Captures the invoice as it prints right now and dates the issue. What
 * decides whether this moment calls for a capture lives with the callers;
 * this only does the capture, the same way for a first issue and for a
 * deliberate refresh of one already issued.
 */
async function captureIssue(
  record: {
    id: string
    invoiceDate?: Date | null
    invoiceDueDate?: Date | null
    issuedData?: unknown
  },
  organizationId: string,
  issuedAt: Date,
  dating: InvoiceDating
): Promise<boolean> {
  const recordId = record.id
  // The inspection's rows are frozen, never its photographs, so they are not
  // decoded here only to be thrown away.
  // The photo is kept for good, so issuing waits longer for it than a
  // redraw does, sharing any decode already under way. Still nothing: the
  // invoice issues without it.
  const assembly = await assembleInvoicePrint(recordId, {
    mode: 'live',
    inspectionResults: 'rows',
    photoWaitMs: ISSUE_PHOTO_WAIT_MS,
  })
  if (!assembly) return false

  const [
    issuedDesignSnapshotId,
    issuedLogoSnapshotId,
    issuedSignatureSnapshotId,
    issuedVehiclePhotoSnapshotId,
  ] = await Promise.all([
    ensureDesignSnapshot(organizationId, assembly.designSource),
    assembly.logoDataUri
      ? ensureAssetSnapshot(organizationId, assembly.logoDataUri)
      : Promise.resolve(null),
    assembly.signer.dataUri
      ? ensureAssetSnapshot(organizationId, assembly.signer.dataUri)
      : Promise.resolve(null),
    // The vehicle's photo, resized, where the design prints it: the sheet
    // reprints with it unchanged whatever happens to the vehicle's photo.
    assembly.vehiclePhotoSource
      ? ensureAssetSnapshot(organizationId, assembly.vehiclePhotoSource)
      : Promise.resolve(null),
  ])

  // Dated the day it is issued, on the workshop's calendar, unless somebody
  // chose the date (invoiceDateAtIssue).
  const timeZone = resolveWorkshopTimeZone(
    assembly.settingsMap?.[SETTING_KEYS.TIMEZONE],
    assembly.settingsMap?.[SETTING_KEYS.TIMEZONE_DETECTED]
  )
  const previous = readIssuedInvoiceData(record.issuedData)
  const dated: ReturnType<typeof invoiceDateAtIssue> =
    dating === 'keep'
      ? { auto: null }
      : invoiceDateAtIssue({
          current: record.invoiceDate,
          previousAuto: previous?.autoInvoiceDate,
          today: startOfZonedDay(new Date(), timeZone),
          redate: dating === 'redate',
        })
  // And falls due by the payment terms from that date, stored, because the
  // past-due report, the portal and the books read the row, not the sheet.
  const due: ReturnType<typeof dueDateAtIssue> =
    dating === 'keep'
      ? { auto: null }
      : dueDateAtIssue({
          current: record.invoiceDueDate,
          previousAuto: previous?.autoInvoiceDueDate,
          invoiceDate: dated.write ?? record.invoiceDate,
          dueDays: Number(assembly.invoiceSettings?.dueDays) || 0,
          timeZone,
          redate: dating === 'redate',
        })

  await db.serviceRecord.update({
    where: { id: recordId },
    data: {
      issuedAt,
      ...(dated.write ? { invoiceDate: dated.write } : {}),
      ...(due.write !== undefined ? { invoiceDueDate: due.write } : {}),
      issuedDesignSnapshotId,
      issuedLogoSnapshotId,
      issuedSignatureSnapshotId,
      issuedVehiclePhotoSnapshotId,
      issuedData: {
        ...buildIssuedInvoiceData(assembly),
        autoInvoiceDate: dated.auto,
        autoInvoiceDueDate: due.auto,
      } as unknown as Prisma.InputJsonValue,
    },
  })
  // Issuing is the moment an accounting connector wants the invoice, and
  // sending or sharing logs no service event of its own. Lazy so this
  // module stays free of the integrations platform.
  import('@/features/integrations/Lib/events')
    .then(({ notifyIntegrations }) =>
      notifyIntegrations({
        event: 'service.update',
        organizationId,
        entity: 'ServiceRecord',
        entityId: recordId,
      })
    )
    .catch((err) => console.error('[integrations] issue notify failed:', err))
  return true
}

/**
 * Freezes what an invoice prints, if this occasion calls for it.
 *
 * Called by every path that makes the invoice the customer's document:
 * sending by email or link, recording a payment, marking it paid, and the
 * freeze of older invoices a workshop asks for in invoice settings. The
 * decision of whether to capture is in shouldIssue; this does the capture.
 * An invoice already issued is left exactly as it is unless an owner has
 * unlocked it since.
 * Returns whether a snapshot was taken.
 */
export async function issueInvoice(
  recordId: string,
  organizationId: string,
  reason: IssueReason
): Promise<boolean> {
  const record = await db.serviceRecord.findFirst({
    where: { id: recordId, organizationId },
    select: {
      id: true,
      issuedAt: true,
      editUnlockedAt: true,
      sentAt: true,
      invoiceDate: true,
      invoiceDueDate: true,
      issuedData: true,
      manuallyPaid: true,
      payments: { select: { id: true } },
    },
  })
  if (!record) return false
  if (!shouldIssue(record, reason)) return false

  // A backfilled invoice is dated to when it was sent, which is the
  // nearest thing to when it was issued that the record knows. Its dates
  // are the ones the customer already holds, and stay; so do those of any
  // invoice sent or paid before issuing tracked it.
  const issuedAt = reason === 'backfill' ? (record.sentAt ?? new Date()) : new Date()
  const dating = reason === 'backfill' || wentOutBeforeIssue(record, reason) ? 'keep' : 'ifUnset'
  return captureIssue(record, organizationId, issuedAt, dating)
}

/**
 * Issues an invoice again from today's rows, on purpose.
 *
 * Sending never re-captures an issued invoice, so a customer's address
 * corrected after the invoice went out, or a detail the vehicle gained
 * since, stayed off the sheet for good unless an owner unlocked the invoice
 * and sent it once more. This is that correction as one deliberate act: the
 * workshop, customer, vehicle, terms and design are read again as they are
 * now and the invoice is locked to them, dated to this moment. The lines
 * and totals are the record's own and were never frozen, so they are not
 * touched. The invoice date moves to today too when the last issue wrote it
 * and nobody has changed it since; a date somebody chose stays. Refused for an invoice that was never issued: a draft prints
 * live already. Returns whether a capture was taken.
 */
export async function reissueInvoice(recordId: string, organizationId: string): Promise<boolean> {
  const record = await db.serviceRecord.findFirst({
    where: { id: recordId, organizationId },
    select: {
      id: true,
      issuedAt: true,
      invoiceDate: true,
      invoiceDueDate: true,
      issuedData: true,
    },
  })
  if (!record?.issuedAt) return false
  return captureIssue(record, organizationId, new Date(), 'redate')
}
