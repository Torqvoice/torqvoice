import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { invoiceLockState, readDocumentLockSettings } from '@/lib/document-lock'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  ensureAssetSnapshot,
  ensureDesignSnapshot,
} from '@/features/invoice-designer/Lib/designSnapshots'
import { assembleInvoicePrint, type InvoicePrintAssembly } from './assembleInvoicePrint'
import {
  ISSUED_INVOICE_VERSION,
  shouldIssue,
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
          mileage: a.data.vehicle.mileage,
        }
      : null,
    technicianName: a.data.technician?.name || a.data.techName || null,
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
    })),
  }
}

const LOCK_SETTING_KEYS = {
  invoiceLockEnabled: SETTING_KEYS.INVOICE_LOCK_ENABLED,
  invoiceLockTrigger: SETTING_KEYS.INVOICE_LOCK_TRIGGER,
  quoteLockEnabled: SETTING_KEYS.QUOTE_LOCK_ENABLED,
  quoteLockTrigger: SETTING_KEYS.QUOTE_LOCK_TRIGGER,
}

/**
 * The lock configuration, read here rather than through the request-cached
 * helper in document-lock.server: that module is server-only, and issuing
 * also runs from the backfill script, outside Next.
 */
async function loadLockSettings(organizationId: string) {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: Object.values(LOCK_SETTING_KEYS) } },
    select: { key: true, value: true },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return readDocumentLockSettings(map, LOCK_SETTING_KEYS)
}

/**
 * Freezes what an invoice prints, if this occasion calls for it.
 *
 * Called by every path that makes the invoice the customer's document:
 * sending by email or link, recording a payment, marking it paid, and the
 * freeze of older invoices a workshop asks for in invoice settings. The
 * decision of whether to capture is in shouldIssue; this does the capture.
 * Returns whether a snapshot was taken.
 */
export async function issueInvoice(
  recordId: string,
  organizationId: string,
  reason: IssueReason
): Promise<boolean> {
  const [record, lockSettings] = await Promise.all([
    db.serviceRecord.findFirst({
      where: { id: recordId, organizationId },
      select: {
        id: true,
        issuedAt: true,
        editUnlockedAt: true,
        sentAt: true,
        manuallyPaid: true,
        totalAmount: true,
        cost: true,
        payments: { select: { amount: true } },
      },
    }),
    loadLockSettings(organizationId),
  ])
  if (!record) return false
  const lock = invoiceLockState(record, lockSettings)
  if (!shouldIssue(record, lock.locked, reason)) return false

  const assembly = await assembleInvoicePrint(recordId, { mode: 'live' })
  if (!assembly) return false

  const [issuedDesignSnapshotId, issuedLogoSnapshotId] = await Promise.all([
    ensureDesignSnapshot(organizationId, assembly.designSource),
    assembly.logoDataUri
      ? ensureAssetSnapshot(organizationId, assembly.logoDataUri)
      : Promise.resolve(null),
  ])

  await db.serviceRecord.update({
    where: { id: recordId },
    data: {
      // A backfilled invoice is dated to when it was sent, which is the
      // nearest thing to when it was issued that the record knows.
      issuedAt: reason === 'backfill' ? (record.sentAt ?? new Date()) : new Date(),
      issuedDesignSnapshotId,
      issuedLogoSnapshotId,
      issuedData: buildIssuedInvoiceData(assembly) as unknown as Prisma.InputJsonValue,
    },
  })
  return true
}
