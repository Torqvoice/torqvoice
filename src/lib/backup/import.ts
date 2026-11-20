import { isStage } from '@/features/work-order-statuses/Lib/stages'
import { copyFile, mkdir, readdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import type { TxClient } from '@/lib/db'
import {
  keepsCurrentPortalMessages,
  portalMessageAuthorIds,
  portalMessageRowsToRestore,
} from '@/lib/backup/portal-messages'
import { clearPlanFor, UPLOAD_CATEGORIES } from '@/lib/backup/manifest'
import {
  rewriteFileUrl,
  rewriteFileUrlsWithin,
  withFileUrls,
  withIssuedDataFileUrls,
} from '@/lib/backup/file-urls'
import { columnsOf } from '@/lib/backup/rows'
import { toSafeDate } from '@/lib/invoice-utils'
import { taxComponentsForCopy } from '@/features/settings/Lib/workshopTax'
import { warrantyFromUntyped } from '@/lib/warranty'
import { atZonedTime } from '@/lib/timezone'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { upgradeLegacySettings } from '@/lib/backup/legacy-settings'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { generateWebhookSecret } from '@/features/webhooks/Lib/sign'
import {
  isRedacted,
  isSecretSettingKey,
  keepCurrentSecrets,
  keepCurrentWebhookSecrets,
} from '@/lib/backup/secrets'
import { Prisma } from '@/generated/prisma/client'
import { extractEntry, type OpenedZip, readJsonFile, type ZipEntry } from '@/lib/backup/zip-file'
import { releaseFilesNotRestored } from '@/lib/files/manager'
import { uploadsRoot } from '@/lib/upload-root'
import { randomUUID } from 'node:crypto'
import { normalizePlate } from '@/lib/license-plate'
import { tenantScoped } from './tenant-guard'
import {
  acquireRestoreLock,
  assertNoForeignRows,
  collectFileIds,
  danglingReferences,
  lookupOwnIds,
  mergeIds,
  releaseRestoreLock,
  RestoreRefusedError,
  sanitiseForeignIds,
} from './tenancy'

/**
 * Putting a backup back into a workshop.
 *
 * The same code serves the zip a person uploads under Settings, Data and a
 * snapshot restic restored from a backup destination: both end up as a
 * parsed `data.json` and a source of files, and from there on nothing
 * cares where they came from. The rows are replaced inside one transaction,
 * so a backup that cannot be read back leaves the workshop as it was; the
 * files are written afterwards, over whatever has the same name.
 */

/** How long the row replacement may take: a large workshop with its files is minutes. */
const TRANSACTION_TIMEOUT_MS = 60 * 60_000

export interface BackupData {
  version: number
  exportedAt?: string
  /**
   * What the backup was written with: "data" when secret keys were left out
   * ("Data only"), "dataAndSecrets" when they are in it. Absent in a file
   * from before the header said so.
   */
  contents?: 'data' | 'dataAndSecrets'
  data: Record<string, any>
}

const BACKUP_CONTENTS: readonly unknown[] = ['data', 'dataAndSecrets']

/** Whose workshop the backup goes into, and who is doing it. */
export interface RestoreActor {
  organizationId: string
  userId: string
}

/** One uploaded file in a backup: `files/<category>/<name>` in a zip, `<category>/<name>` on disk. */
export interface BackupFileEntry {
  category: string
  name: string
}

/** Where a backup's files come from: the archive, or a folder restic restored. */
export interface BackupFileSource {
  entries: readonly BackupFileEntry[]
  /** Writes one entry to `target`, creating the folder it goes in. */
  extract(entry: BackupFileEntry, target: string): Promise<void>
}

/** Throws when the file is not a backup this version can read. */
export function assertSupportedBackup(backup: unknown): asserts backup is BackupData {
  const b = backup as Partial<BackupData> | null | undefined
  if (!b?.version || (b.version !== 1 && b.version !== 2)) {
    throw new Error('Unsupported or missing backup version')
  }
  if (b.contents !== undefined && !BACKUP_CONTENTS.includes(b.contents)) {
    throw new Error('Unsupported backup contents')
  }
  if (!b.data) throw new Error('No data found in backup')
}

/**
 * The files inside an archive. Both layouts are read:
 *   files/{category}/{filename}   (v2 backup)
 *   uploads/{category}/{filename} (legacy backup)
 */
export function zipFileSource(zip: OpenedZip): BackupFileSource {
  const raw = new Map<BackupFileEntry, ZipEntry>()
  for (const e of zip.entries) {
    if (e.dir || !(e.name.startsWith('files/') || e.name.startsWith('uploads/'))) continue
    const parts = e.name.split('/')
    if (parts.length !== 3) continue
    raw.set({ category: parts[1], name: parts[2] }, e)
  }
  return {
    entries: [...raw.keys()],
    extract(entry, target) {
      const zipEntry = raw.get(entry)
      if (!zipEntry) throw new Error(`Unknown backup file ${entry.category}/${entry.name}`)
      return extractEntry(zip, zipEntry, target)
    },
  }
}

/**
 * The files in a restored uploads folder: one subfolder per category, as the
 * backup engine took them. Each file is moved into place, or copied when
 * the folder is on another disk; the restored folder is thrown away after.
 */
export async function directoryFileSource(dir: string): Promise<BackupFileSource> {
  const entries: BackupFileEntry[] = []
  for (const category of await readdir(dir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue
    for (const file of await readdir(path.join(dir, category.name), { withFileTypes: true })) {
      if (file.isFile()) entries.push({ category: category.name, name: file.name })
    }
  }
  return {
    entries,
    async extract(entry, target) {
      const source = path.join(dir, entry.category, entry.name)
      await mkdir(path.dirname(target), { recursive: true })
      try {
        await rename(source, target)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
        await copyFile(source, target)
      }
    },
  }
}

/**
 * A document's taxable subtotal as the backup holds it: the figure when some
 * of its lines were untaxed, null (the whole subtotal) otherwise, which is
 * also what every backup from before the column existed says by omission.
 */
function storedTaxableSubtotalFromBackup(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * A number as the backup holds it, zero included. The fallback is for a file
 * that has none: written as `value || fallback`, a part line with a quantity
 * of zero came back as one and an odometer at zero as unknown.
 */
function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A vehicle's year as the backup holds it. The column is a non-null
 * integer, and 0 is the app's unknown-year marker, so a row without a
 * decodable year restores as 0 instead of failing the whole restore
 * mid-transaction; a year written as text (a hand-edited backup) is read
 * as its number, as the vehicle form's own coercion does. Values above
 * the column's signed 32-bit maximum are rejected the same way: they
 * would still fail the insert and roll the restore back.
 */
function restoredVehicleYear(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : 0
}

/** A foreign key from the backup, kept only when this import restored its target. */
function keptReference(id: unknown, restored: ReadonlySet<string> | undefined): string | null {
  return typeof id === 'string' && id && restored?.has(id) ? id : null
}

/**
 * When a restored inspection's link started. A backup from before links
 * carried a start date has none: the link then counts from the inspection's
 * last change, as the migration did, or it would never expire.
 */
function restoredInspectionSharedAt(insp: Record<string, unknown>): Date | null {
  const sharedAt = toSafeDate(insp.sharedAt as string)
  if (sharedAt || !insp.publicToken) return sharedAt ?? null
  return toSafeDate(insp.updatedAt as string) ?? new Date()
}

/**
 * Restores one service record with its nested parts/labor/attachments/payments.
 * Used for both vehicle-linked records (nested under vehicles in the backup)
 * and counter sales (top-level records without a vehicle).
 */
async function importServiceRecordTree(
  tx: TxClient,
  sr: Record<string, unknown>,
  opts: {
    organizationId: string
    vehicleId: string | null
    customerId: string | null
    workDayStartTime: string
    /** The restored workshop's zone, which workDayStartTime is read in. */
    timeZone: string
    /** Technicians restored by this import. See the time entries below. */
    technicianIds: ReadonlySet<string>
    /** The workshop's own statuses restored by this import. */
    workOrderStatusIds: ReadonlySet<string>
    /**
     * The people in the restored workshop. Whoever opened or unlocked a job is
     * kept only when they are one of them: a backup brought to another install
     * names accounts that do not exist there.
     */
    memberUserIds: ReadonlySet<string>
    /**
     * Designs and snapshots restored by this import. A reference to one the
     * backup did not carry is dropped rather than left dangling: the record
     * then prints from the default, as any invoice without a design does.
     */
    designIds?: ReadonlySet<string>
    designSnapshotIds?: ReadonlySet<string>
    assetSnapshotIds?: ReadonlySet<string>
  }
) {
  // Derive startDateTime/endDateTime from backup or fall back to serviceDate + work day start
  let startDT: Date | undefined
  let endDT: Date | undefined
  if (sr.startDateTime) {
    startDT = toSafeDate(sr.startDateTime as string)
  }
  if (!startDT && sr.serviceDate) {
    const sd = toSafeDate(sr.serviceDate as string)
    if (sd) {
      startDT = atZonedTime(sd, opts.workDayStartTime, opts.timeZone)
    }
  }
  if (sr.endDateTime) {
    endDT = toSafeDate(sr.endDateTime as string)
  }
  if (!endDT && startDT) {
    endDT = new Date(startDT.getTime() + 3600000)
  }

  await tx.serviceRecord.create({
    data: {
      id: sr.id as string,
      organizationId: opts.organizationId,
      title: sr.title as string,
      description: (sr.description as string) || null,
      type: (sr.type as string) || 'maintenance',
      status: (sr.status as string) || 'completed',
      cost: (sr.cost as number) || 0,
      mileage: numberOr(sr.mileage, null),
      serviceDate: toSafeDate(sr.serviceDate as string),
      startDateTime: startDT ?? undefined,
      endDateTime: endDT ?? undefined,
      promisedAt: sr.promisedAt ? (toSafeDate(sr.promisedAt as string) ?? null) : null,
      // The customer's reference / PO. Absent from a backup taken before the
      // field existed, which restores as none.
      customerReference: (sr.customerReference as string) || null,
      shopName: (sr.shopName as string) || null,
      techName: (sr.techName as string) || null,
      parts: (sr.parts as string) || null,
      laborHours: numberOr(sr.laborHours, null),
      diagnosticNotes: (sr.diagnosticNotes as string) || null,
      invoiceNotes: (sr.invoiceNotes as string) || null,
      subtotal: (sr.subtotal as number) || 0,
      taxRate: (sr.taxRate as number) || 0,
      taxAmount: (sr.taxAmount as number) || 0,
      taxInclusive: (sr.taxInclusive as boolean) ?? false,
      taxComponents: taxComponentsForCopy(sr.taxComponents),
      taxableSubtotal: storedTaxableSubtotalFromBackup(sr.taxableSubtotal),
      totalAmount: (sr.totalAmount as number) || 0,
      invoiceNumber: (sr.invoiceNumber as string) || null,
      invoiceDate: sr.invoiceDate ? toSafeDate(sr.invoiceDate as string) : null,
      invoiceDueDate: sr.invoiceDueDate ? toSafeDate(sr.invoiceDueDate as string) : null,
      discountType: (sr.discountType as string) || null,
      discountValue: (sr.discountValue as number) || 0,
      discountAmount: (sr.discountAmount as number) || 0,
      // A backup from before the statement existed has months and no status,
      // which is read as the included warranty it was.
      ...warrantyFromUntyped(sr),
      warrantyExpiresAt: sr.warrantyExpiresAt ? toSafeDate(sr.warrantyExpiresAt as string) : null,
      conditionMapOnInvoice:
        typeof sr.conditionMapOnInvoice === 'boolean' ? sr.conditionMapOnInvoice : null,
      publicToken: (sr.publicToken as string) || null,
      // The link's own expiry answers travel with its token, or a restored
      // link would forget the date the workshop set on it.
      sharedAt: toSafeDate(sr.sharedAt as string) ?? null,
      shareExpiresAt: toSafeDate(sr.shareExpiresAt as string) ?? null,
      shareNeverExpires: sr.shareNeverExpires === true,
      shareRenewedAt: toSafeDate(sr.shareRenewedAt as string) ?? null,
      // Marked paid by hand is what closes an invoice's link under the
      // "after payment" rule; without it a settled invoice restores as owed
      // and its link stays open.
      manuallyPaid: sr.manuallyPaid === true,
      manuallyPaidAt: toSafeDate(sr.manuallyPaidAt as string) ?? null,
      viewCount: (sr.viewCount as number) || 0,
      lastViewedAt: sr.lastViewedAt ? toSafeDate(sr.lastViewedAt as string) : null,
      sentAt: sr.sentAt ? toSafeDate(sr.sentAt as string) : null,
      bookingSource: (sr.bookingSource as string) || null,
      createdById: keptReference(sr.createdById, opts.memberUserIds),
      editUnlockedAt: sr.editUnlockedAt ? toSafeDate(sr.editUnlockedAt as string) : null,
      editUnlockedById: keptReference(sr.editUnlockedById, opts.memberUserIds),
      // Only a technician this import restored: a job pointing at one the
      // backup does not carry would be refused, and take the import with it.
      technicianId: keptReference(sr.technicianId, opts.technicianIds),
      workBayId: (sr.workBayId as string) || null,
      // Only a status this import restored. A backup made without the workshop
      // configuration carries jobs that name statuses it does not hold; those
      // jobs keep their stage and lose the label, rather than failing the import.
      customStatusId: keptReference(sr.customStatusId, opts.workOrderStatusIds),
      customStatusSince:
        sr.customStatusSince && opts.workOrderStatusIds.has(sr.customStatusId as string)
          ? toSafeDate(sr.customStatusSince as string)
          : null,
      sortOrder: (sr.sortOrder as number) || 0,
      createdAt: toSafeDate(sr.createdAt as string),
      updatedAt: toSafeDate(sr.updatedAt as string),
      vehicleId: opts.vehicleId,
      customerId: opts.customerId,
      designId: keptReference(sr.designId, opts.designIds),
      issuedAt: sr.issuedAt ? toSafeDate(sr.issuedAt as string) : null,
      issuedDesignSnapshotId: keptReference(sr.issuedDesignSnapshotId, opts.designSnapshotIds),
      issuedLogoSnapshotId: keptReference(sr.issuedLogoSnapshotId, opts.assetSnapshotIds),
      issuedSignatureSnapshotId: keptReference(sr.issuedSignatureSnapshotId, opts.assetSnapshotIds),
      issuedData:
        sr.issuedData && typeof sr.issuedData === 'object'
          ? (withIssuedDataFileUrls(sr.issuedData, opts.organizationId) as Prisma.InputJsonValue)
          : undefined,
    },
  })

  // Service parts
  const partItems = sr.partItems as Record<string, unknown>[] | undefined
  if (partItems?.length) {
    await tx.servicePart.createMany({
      data: partItems.map((p) => ({
        id: p.id as string,
        partNumber: (p.partNumber as string) || null,
        name: p.name as string,
        quantity: numberOr(p.quantity, 1),
        unit: (p.unit as string) || null,
        category: (p.category as string) || null,
        unitPrice: (p.unitPrice as number) || 0,
        total: (p.total as number) || 0,
        unitCost: (p.unitCost as number) || 0,
        markupPercent: (p.markupPercent as number) || 0,
        // Inventory parts are restored earlier in this transaction with their
        // ids preserved, so the stock link survives a restore verbatim.
        inventoryPartId: (p.inventoryPartId as string) || null,
        // A backup taken before lines could be untaxed has no flag: every
        // line in it was taxed. One that says false is restored as it was.
        taxable: p.taxable !== false,
        serviceRecordId: sr.id as string,
      })),
    })
  }

  // Concerns. Restored before findings so a finding's concernId still has a
  // row to point at.
  const concerns = sr.concerns as Record<string, unknown>[] | undefined
  if (concerns?.length) {
    await tx.serviceConcern.createMany({
      data: concerns.map((c, index) => ({
        id: c.id as string,
        description: c.description as string,
        sortOrder: (c.sortOrder as number) ?? index,
        cause: (c.cause as string) || null,
        correction: (c.correction as string) || null,
        confirmation: (c.confirmation as string) || null,
        // When it was confirmed always comes back; who, only when that person
        // is in this workshop. A backup brought from another installation
        // names an account that is not here.
        confirmedAt: c.confirmedAt ? (toSafeDate(c.confirmedAt as string) ?? null) : null,
        confirmedById: keptReference(c.confirmedById, opts.memberUserIds),
        createdAt: toSafeDate(c.createdAt as string),
        updatedAt: toSafeDate(c.updatedAt as string),
        serviceRecordId: sr.id as string,
      })),
    })
  }

  // Service labor
  const laborItems = sr.laborItems as Record<string, unknown>[] | undefined
  if (laborItems?.length) {
    await tx.serviceLabor.createMany({
      data: laborItems.map((l) => ({
        id: l.id as string,
        description: l.description as string,
        hours: (l.hours as number) || 0,
        rate: (l.rate as number) || 0,
        total: (l.total as number) || 0,
        // How the line is priced is what makes a shop fee a shop fee; left
        // out, a restored fee came back as an hour of labor.
        pricingType: (l.pricingType as string) || 'hourly',
        taxable: l.taxable !== false,
        serviceRecordId: sr.id as string,
      })),
    })
  }

  // Service attachments
  const restoredConcernIds = new Set((concerns ?? []).map((c) => c.id as string))
  const attachments = sr.attachments as Record<string, unknown>[] | undefined
  if (attachments?.length) {
    await tx.serviceAttachment.createMany({
      data: attachments.map((a) => ({
        id: a.id as string,
        fileName: a.fileName as string,
        fileUrl: rewriteFileUrl(a.fileUrl as string, opts.organizationId) || (a.fileUrl as string),
        fileType: a.fileType as string,
        fileSize: (a.fileSize as number) || 0,
        category: (a.category as string) || 'diagnostic',
        description: (a.description as string) || null,
        includeInInvoice: a.includeInInvoice !== false,
        createdAt: toSafeDate(a.createdAt as string),
        serviceRecordId: sr.id as string,
        // The concern it was filed under, when this record restored it above.
        concernId: keptReference(a.concernId, restoredConcernIds),
        // What a scan for fault codes found in the file.
        scan: a.scan === null || a.scan === undefined ? undefined : (a.scan as object),
      })),
    })
  }

  // Status reports. They cascade from the service record, so a restore
  // without them loses every report the workshop sent.
  await restoreRows(
    'status reports',
    (rows) => tx.statusReport.createMany({ data: rows as never }),
    sr.statusReports,
    {
      organizationId: opts.organizationId,
    },
    { fields: ['videoUrl'], organizationId: opts.organizationId }
  )

  // Clocked time. This is what a technician's hours were billed from, and in
  // Germany it is a statutory record, so losing it on a restore is not the
  // same as losing a cached total.
  //
  // Each entry needs its technician, and technicianId is not nullable. A
  // restore that took vehicles but not technicians has nowhere to attach
  // them, so those are dropped rather than failing the whole import: the
  // alternative is a foreign key error that rolls back everything and tells
  // the user nothing.
  const timeEntries = (sr.timeEntries as Record<string, unknown>[] | undefined)?.filter((entry) =>
    opts.technicianIds.has(entry.technicianId as string)
  )
  await restoreRows(
    'time entries',
    (rows) => tx.timeEntry.createMany({ data: rows as never }),
    timeEntries,
    {
      organizationId: opts.organizationId,
      serviceRecordId: sr.id as string,
    }
  )

  // Who was on the job besides its technician. Each row needs its technician
  // as a time entry does, so the same rule holds: a restore without the
  // technicians drops these rather than failing on the foreign key.
  const helpers = (sr.helpers as Record<string, unknown>[] | undefined)?.filter((helper) =>
    opts.technicianIds.has(helper.technicianId as string)
  )
  await restoreRows(
    'job helpers',
    (rows) => tx.serviceRecordHelper.createMany({ data: rows as never }),
    helpers,
    {
      organizationId: opts.organizationId,
      serviceRecordId: sr.id as string,
    }
  )

  // Payments
  const payments = sr.payments as Record<string, unknown>[] | undefined
  if (payments?.length) {
    await tx.payment.createMany({
      data: payments.map((p) => ({
        id: p.id as string,
        amount: p.amount as number,
        date: toSafeDate(p.date as string),
        method: (p.method as string) || 'other',
        note: (p.note as string) || null,
        // Which payment provider took it and under what reference. This pair
        // is how a webhook delivered twice is told from a second payment.
        provider: (p.provider as string) || null,
        externalId: (p.externalId as string) || null,
        createdAt: toSafeDate(p.createdAt as string),
        updatedAt: toSafeDate(p.updatedAt as string),
        serviceRecordId: sr.id as string,
      })),
    })
  }
}

/**
 * Writes rows back with the ids they had.
 *
 * Keeping ids is what lets everything else in the file keep pointing at them,
 * and it is why a table that is restored must also be cleared first.
 */
async function restoreRows(
  what: string,
  create: (rows: Record<string, unknown>[]) => Promise<unknown>,
  rows: unknown,
  override: Record<string, unknown> = {},
  files?: { fields: readonly string[]; organizationId: string }
) {
  const list = rows as Record<string, unknown>[] | undefined
  if (!list?.length) return

  try {
    await create(
      list.map((row) => {
        const columns = columnsOf(row, override)
        return files ? withFileUrls(row, columns, files.fields, files.organizationId) : columns
      })
    )
  } catch (error) {
    // A restore rolls back as a whole, so the only thing left to salvage is
    // knowing which part of the file could not be read back.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not restore ${what}: ${reason}`)
  }
}

async function restoreFiles(files: BackupFileSource, organizationId: string) {
  const uploadsDir = path.join(uploadsRoot(), organizationId)

  // The backup's files are written first, over whatever has the same name.
  const restored = new Map<string, Set<string>>()
  for (const entry of files.entries) {
    const { category, name: filename } = entry
    if (!UPLOAD_CATEGORIES.includes(category)) continue

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) continue

    // Each file streams from its source to its place; none is held whole.
    await files.extract(entry, path.join(uploadsDir, category, filename))

    const names = restored.get(category) ?? new Set<string>()
    names.add(filename)
    restored.set(category, names)
  }

  // Then the files in those folders that the backup did not bring back go
  // through the file manager, which keeps any a row still uses. The folders
  // used to be emptied first, which also took files uploaded after the backup
  // was made, still used by rows this restore did not replace. Only the
  // folders the backup carries are looked at: it has nothing to say about
  // the others (the portal background, the tire photos, when absent).
  for (const [category, names] of restored) {
    await releaseFilesNotRestored(organizationId, category, names)
  }
}

/**
 * Replaces the workshop's data with the backup's, then its files. Secret
 * keys a "Data only" backup left out keep the values the install has now;
 * the keys it had none for are returned so the workshop can re-enter them.
 * Throws when the backup cannot be read back; the transaction has rolled
 * back by then and no file has been touched.
 */
export async function restoreBackup(
  ctx: RestoreActor,
  backup: BackupData,
  files: BackupFileSource | null
): Promise<{ redactedSettings: string[] }> {
  assertSupportedBackup(backup)
  const data = backup.data

  // Secret keys a "Data only" backup left out, which the workshop re-enters.
  let redactedSettings: string[] = []

  // One restore at a time on this server, however it was started: two large
  // ones would fight over the database, and a second one is told so.
  const lock = randomUUID()
  if (!acquireRestoreLock(lock)) {
    throw new RestoreRefusedError('busy', 'A restore is already running on this server')
  }
  try {
    await db.$transaction(
      async (raw) => {
        const tx = tenantScoped(raw, ctx.organizationId)
        const organizationId = ctx.organizationId

        // Tenancy (lib/backup/tenancy.ts): nothing in the file may be, or
        // point at, another workshop's row. Checked before a row is touched.
        const fileIds = collectFileIds(data)
        await assertNoForeignRows(tx, organizationId, fileIds)
        const own = await lookupOwnIds(tx, organizationId, danglingReferences(data, fileIds))
        sanitiseForeignIds(data, mergeIds(fileIds, own))

        // 0. A redacted secret keeps what the install has now, so read those
        // before the tables are cleared. A "Data only" file also keeps every
        // secret the install has that the file does not carry at all, such
        // as a key entered after the backup was taken. The header says which
        // kind the file is; a file from before it did counts as "Data only"
        // when it has a marker.
        if (Array.isArray(data.settings)) {
          // Keys an older version wrote are renamed first, as the migrations
          // that renamed them did for the live rows: those do not run again.
          const settingRows = upgradeLegacySettings(
            data.settings as { key: string; value: unknown }[]
          )
          const marked = settingRows.some((s) => isRedacted(s.value))
          const dataOnly = backup.contents === 'data' || (backup.contents === undefined && marked)
          const current =
            dataOnly || marked
              ? (
                  await tx.appSetting.findMany({
                    where: { organizationId },
                    select: { id: true, key: true, value: true },
                  })
                ).filter((s) => isSecretSettingKey(s.key))
              : []
          const kept = keepCurrentSecrets(
            settingRows,
            new Map(current.map((s) => [s.key, s.value])),
            current,
            { dataOnly }
          )
          data.settings = kept.rows
          redactedSettings = kept.redacted
        }
        if (Array.isArray(data.webhooks)) {
          const webhookRows = data.webhooks as Record<string, unknown>[]
          const current = webhookRows.some((w) => isRedacted(w.secret))
            ? await tx.webhook.findMany({
                where: { organizationId },
                select: { id: true, url: true, secret: true },
              })
            : []
          data.webhooks = keepCurrentWebhookSecrets(
            webhookRows,
            current,
            generateWebhookSecret
          ).rows
        }

        // 1. Clear what this backup can put back, and nothing else.
        //
        // A selective export omits the keys it was not asked for. Clearing a
        // table the file says nothing about deletes records it cannot restore,
        // which is how importing a customers-only export used to wipe every
        // vehicle in the workshop.
        const clearable: Record<string, () => Promise<unknown>> = {
          Notification: () => tx.notification.deleteMany({ where: { organizationId } }),
          SmsMessage: () => tx.smsMessage.deleteMany({ where: { organizationId } }),
          WhatsappMessage: () => tx.whatsappMessage.deleteMany({ where: { organizationId } }),
          TelegramMessage: () => tx.telegramMessage.deleteMany({ where: { organizationId } }),
          PortalMessage: () => tx.portalMessage.deleteMany({ where: { organizationId } }),
          // Attachment rows go with their message by cascade.
          EmailMessage: () => tx.emailMessage.deleteMany({ where: { organizationId } }),
          ScheduledMessage: () => tx.scheduledMessage.deleteMany({ where: { organizationId } }),
          InspectionReminderSend: () =>
            tx.inspectionReminderSend.deleteMany({ where: { organizationId } }),
          InspectionReminderCampaign: () =>
            tx.inspectionReminderCampaign.deleteMany({ where: { organizationId } }),
          AuditLog: () => tx.auditLog.deleteMany({ where: { organizationId } }),
          Inspection: () => tx.inspection.deleteMany({ where: { organizationId } }),
          InspectionTemplate: () => tx.inspectionTemplate.deleteMany({ where: { organizationId } }),
          Quote: () => tx.quote.deleteMany({ where: { organizationId } }),
          // Every alert, on an appointment or on a job, before what it points at.
          AppointmentNotification: () =>
            tx.appointmentNotification.deleteMany({ where: { organizationId } }),
          Appointment: () => tx.appointment.deleteMany({ where: { organizationId } }),
          TireSet: () => tx.tireSet.deleteMany({ where: { organizationId } }),
          TireWarehouse: () => tx.tireWarehouse.deleteMany({ where: { organizationId } }),
          // Counter sales hang off a customer rather than a vehicle, so nothing
          // else deletes them and a second restore used to collide with them.
          ServiceRecord: () =>
            tx.serviceRecord.deleteMany({ where: { organizationId, vehicleId: null } }),
          Reminder: () => tx.reminder.deleteMany({ where: { organizationId, vehicleId: null } }),
          Vehicle: () => tx.vehicle.deleteMany({ where: { organizationId } }),
          CustomFieldDefinition: () =>
            tx.customFieldDefinition.deleteMany({ where: { organizationId } }),
          // Each vehicle's meters and their readings go with their meter.
          MeterType: () => tx.meterType.deleteMany({ where: { organizationId } }),
          // An item points at its kind with Restrict, so any item still here
          // (the vehicles normally take theirs first) goes before the kinds,
          // with its history, meters and links.
          EquipmentType: () =>
            tx.equipmentItem
              .deleteMany({ where: { organizationId } })
              .then(() => tx.equipmentType.deleteMany({ where: { organizationId } })),
          InventoryPart: () => tx.inventoryPart.deleteMany({ where: { organizationId } }),
          Technician: () => tx.technician.deleteMany({ where: { organizationId } }),
          WorkBay: () => tx.workBay.deleteMany({ where: { organizationId } }),
          WorkshopClosure: () => tx.workshopClosure.deleteMany({ where: { organizationId } }),
          Customer: () => tx.customer.deleteMany({ where: { organizationId } }),
          LaborPreset: () => tx.laborPreset.deleteMany({ where: { organizationId } }),
          ConditionMarkType: () => tx.conditionMarkType.deleteMany({ where: { organizationId } }),
          Webhook: () => tx.webhook.deleteMany({ where: { organizationId } }),
          ReportSchedule: () => tx.reportSchedule.deleteMany({ where: { organizationId } }),
          WorkOrderStatus: () => tx.workOrderStatus.deleteMany({ where: { organizationId } }),
          AppSetting: () => tx.appSetting.deleteMany({ where: { organizationId } }),
          DocumentDesign: () => tx.documentDesign.deleteMany({ where: { organizationId } }),
          EmailTemplate: () => tx.emailTemplate.deleteMany({ where: { organizationId } }),
          DocumentDesignSnapshot: () =>
            tx.documentDesignSnapshot.deleteMany({ where: { organizationId } }),
          DocumentAssetSnapshot: () =>
            tx.documentAssetSnapshot.deleteMany({ where: { organizationId } }),
        }

        // The portal chat goes with its customers by cascade. A file that
        // replaces the customers without carrying the chat would delete every
        // conversation, so those are read first and put back further down.
        //
        // The chat stays open while a restore runs, so the rows are locked
        // before they are read. A message being sent takes a share of its
        // customer's row, and a read receipt takes its message's row: locking
        // both waits for the writes already under way, which the read below
        // then sees, and holds new ones until the restore commits. One that
        // waited finds its customer or message replaced and fails or changes
        // nothing; it is never taken in and then silently dropped.
        let currentPortalMessages: Record<string, unknown>[] = []
        if (keepsCurrentPortalMessages(data)) {
          await raw.$queryRaw(Prisma.sql`
            SELECT count(*) FROM (
              SELECT 1 FROM "public"."customers" WHERE "organizationId" = ${organizationId} FOR UPDATE
            ) locked
          `)
          await raw.$queryRaw(Prisma.sql`
            SELECT count(*) FROM (
              SELECT 1 FROM "public"."portal_messages" WHERE "organizationId" = ${organizationId} FOR UPDATE
            ) locked
          `)
          currentPortalMessages = await tx.portalMessage.findMany({ where: { organizationId } })
        }

        // A file that replaces the vehicles without carrying meters (one taken
        // before meters, or by hand): clearing the vehicles takes their meters
        // and readings with them, so they are read first and put back below
        // on the vehicles that come back.
        //
        // An equipment item's meters go with the item, which goes with its
        // vehicle, and with their meter: kept when the file replaces the
        // items without meters, or the meters without equipment (a file taken
        // before equipment, whose meters are only the vehicles').
        const replacesItems = data.vehicles !== undefined || data.equipmentTypes !== undefined
        const keepsVehicleMeters = data.vehicles !== undefined && data.meterTypes === undefined
        const keepsItemMeters =
          (replacesItems && data.meterTypes === undefined) ||
          (data.meterTypes !== undefined && data.equipmentTypes === undefined)
        const keptMeters =
          keepsVehicleMeters || keepsItemMeters
            ? await tx.vehicleMeter.findMany({
                where: {
                  organizationId,
                  ...(keepsVehicleMeters && keepsItemMeters
                    ? {}
                    : keepsVehicleMeters
                      ? { vehicleId: { not: null } }
                      : { equipmentItemId: { not: null } }),
                },
                include: { readings: true },
              })
            : []

        // Equipment likewise: a file that replaces the vehicles without
        // carrying equipment (one taken before it) would take every item
        // with its vehicle, so the items and where they have been are read
        // first and put back on the vehicles that come back. The links from
        // jobs and quotes to items go with the job, the quote or the item, so
        // a file without equipment that replaces any of those keeps them too.
        const keptEquipment =
          data.vehicles !== undefined && data.equipmentTypes === undefined
            ? await tx.equipmentItem.findMany({
                where: { organizationId },
                include: { fittings: true },
              })
            : []
        const keepsEquipmentLinks =
          data.equipmentTypes === undefined &&
          (data.vehicles !== undefined ||
            data.counterSales !== undefined ||
            data.quotes !== undefined)
        const keptJobEquipment = keepsEquipmentLinks
          ? await tx.serviceRecordEquipment.findMany({ where: { organizationId } })
          : []
        const keptQuoteEquipment = keepsEquipmentLinks
          ? await tx.quoteEquipment.findMany({ where: { organizationId } })
          : []

        for (const model of clearPlanFor(Object.keys(data))) {
          const clear = clearable[model]
          if (clear) await clear()
        }

        // 2. Insert settings
        if (data.settings?.length) {
          await tx.appSetting.createMany({
            data: (data.settings as Record<string, unknown>[]).map((s: Record<string, unknown>) => {
              // A setting's value can be a stored file (the workshop logo, the
              // portal background), in any of the shapes uploads have had.
              const value = (rewriteFileUrl(s.value as string, ctx.organizationId) ??
                s.value) as string
              return {
                id: s.id as string,
                key: s.key as string,
                value,
                userId: ctx.userId,
                organizationId: ctx.organizationId,
              }
            }),
          })
        }

        // 2b. Named designs, and what issued invoices were issued with. Before
        // customers and service records, which point at them. Backups from
        // before these existed have none of the keys and restore as before.
        const designIds = new Set<string>()
        if (data.documentDesigns?.length) {
          const rows = (data.documentDesigns as Record<string, unknown>[]).filter(
            (d) => typeof d.id === 'string' && typeof d.name === 'string'
          )
          await tx.documentDesign.createMany({
            data: rows.map((d) => ({
              id: d.id as string,
              organizationId: ctx.organizationId,
              documentType: (d.documentType as string) || 'invoice',
              name: d.name as string,
              layout: (d.layout ?? {}) as Prisma.InputJsonValue,
              // The design's own logo is a stored upload inside the template.
              template: rewriteFileUrlsWithin(
                d.template ?? {},
                ctx.organizationId
              ) as Prisma.InputJsonValue,
              // The rule that picks this design by itself, for counter sales.
              autoRule: (d.autoRule as string) || null,
              createdAt: toSafeDate(d.createdAt as string),
              updatedAt: toSafeDate(d.updatedAt as string),
            })),
          })
          for (const d of rows) designIds.add(d.id as string)
        }
        // Email templates: the setting that names the one in use came back with
        // settings, so the rows it points at have to come back with their ids.
        if (data.emailTemplates?.length) {
          const rows = (data.emailTemplates as Record<string, unknown>[]).filter(
            (t) =>
              typeof t.id === 'string' && typeof t.name === 'string' && typeof t.kind === 'string'
          )
          // Uploads travel under this organisation's id, so every stored
          // upload URL is rewritten the way logo settings are.
          const rewriteAssets = (value: unknown) => rewriteFileUrlsWithin(value, ctx.organizationId)
          await tx.emailTemplate.createMany({
            data: rows.map((t) => ({
              id: t.id as string,
              organizationId: ctx.organizationId,
              kind: t.kind as string,
              name: t.name as string,
              subject: (t.subject as string) || '',
              blocks: rewriteAssets(t.blocks ?? []) as Prisma.InputJsonValue,
              theme: rewriteAssets(t.theme ?? {}) as Prisma.InputJsonValue,
              createdAt: toSafeDate(t.createdAt as string),
              updatedAt: toSafeDate(t.updatedAt as string),
            })),
          })
        }
        const designSnapshotIds = new Set<string>()
        if (data.documentDesignSnapshots?.length) {
          const rows = (data.documentDesignSnapshots as Record<string, unknown>[]).filter(
            (d) => typeof d.id === 'string' && typeof d.hash === 'string'
          )
          // The look an invoice was issued with, kept exactly as it was: the
          // row's hash is taken over its own content, and the logo an issued
          // document prints comes from the frozen bytes beside it
          // (issuedLogoSnapshot), not from the URL in here. So the URLs in a
          // snapshot are left naming the workshop the backup came from.
          await tx.documentDesignSnapshot.createMany({
            data: rows.map((d) => ({
              id: d.id as string,
              organizationId: ctx.organizationId,
              hash: d.hash as string,
              layout: (d.layout ?? {}) as Prisma.InputJsonValue,
              template: (d.template ?? {}) as Prisma.InputJsonValue,
              createdAt: toSafeDate(d.createdAt as string),
            })),
          })
          for (const d of rows) designSnapshotIds.add(d.id as string)
        }
        const assetSnapshotIds = new Set<string>()
        if (data.documentAssetSnapshots?.length) {
          const rows = (data.documentAssetSnapshots as Record<string, unknown>[]).filter(
            (d) =>
              typeof d.id === 'string' && typeof d.hash === 'string' && typeof d.data === 'string'
          )
          await tx.documentAssetSnapshot.createMany({
            data: rows.map((d) => ({
              id: d.id as string,
              organizationId: ctx.organizationId,
              hash: d.hash as string,
              mimeType: (d.mimeType as string) || 'image/png',
              data: new Uint8Array(Buffer.from(d.data as string, 'base64')),
              createdAt: toSafeDate(d.createdAt as string),
            })),
          })
          for (const d of rows) assetSnapshotIds.add(d.id as string)
        }

        // 3. Insert customers
        if (data.customers?.length) {
          await tx.customer.createMany({
            data: (data.customers as Record<string, unknown>[]).map(
              (c: Record<string, unknown>) => ({
                id: c.id as string,
                customerNumber: (c.customerNumber as string) || null,
                name: c.name as string,
                email: (c.email as string) || null,
                phone: (c.phone as string) || null,
                address: (c.address as string) || null,
                company: (c.company as string) || null,
                notes: (c.notes as string) || null,
                // What the invoice prints and charges by: a tax number, and
                // whether this customer pays tax at all.
                taxId: (c.taxId as string) || null,
                taxExempt: (c.taxExempt as boolean) || false,
                // A customer who asked not to be reminded stays unreminded.
                reminderOptOut: (c.reminderOptOut as boolean) || false,
                // A customer whose invoices wait for a reference / PO still does.
                poRequired: (c.poRequired as boolean) || false,
                // The Telegram chat the customer linked; without it their
                // messages arrive from nobody.
                telegramChatId: (c.telegramChatId as string) || null,
                invoiceDesignId: keptReference(c.invoiceDesignId, designIds),
                createdAt: toSafeDate(c.createdAt as string),
                updatedAt: toSafeDate(c.updatedAt as string),
                userId: ctx.userId,
                organizationId: ctx.organizationId,
              })
            ),
          })
        }

        // 4. Insert technicians
        if (data.technicians?.length) {
          // A technician can be linked to a person's account, and a backup only
          // carries that account's id. Restored into another installation, or
          // into this one after the person was removed, the id points at nobody
          // and the foreign key refuses the whole import. The link is kept only
          // for people who are members of this workshop today; anybody else
          // comes back as a board-only technician, name and all, and can be
          // linked again from the team page.
          const linkedUserIds = [
            ...new Set(
              (data.technicians as Record<string, unknown>[])
                .map((t) => t.userId)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
            ),
          ]
          const members = linkedUserIds.length
            ? await tx.organizationMember.findMany({
                where: { organizationId: ctx.organizationId, userId: { in: linkedUserIds } },
                select: { userId: true },
              })
            : []
          const memberUserIds = new Set(members.map((m) => m.userId))

          await tx.technician.createMany({
            data: (data.technicians as Record<string, unknown>[]).map(
              (t: Record<string, unknown>) => ({
                id: t.id as string,
                name: t.name as string,
                color: (t.color as string) || '#3b82f6',
                isActive: t.isActive !== false,
                sortOrder: (t.sortOrder as number) || 0,
                dailyCapacity: numberOr(t.dailyCapacity, 480),
                skills: (t.skills as string) || null,
                // memberId from old backups is ignored: it has no FK to users.
                userId:
                  typeof t.userId === 'string' && memberUserIds.has(t.userId) ? t.userId : null,
                createdAt: toSafeDate(t.createdAt as string),
                updatedAt: toSafeDate(t.updatedAt as string),
                organizationId: ctx.organizationId,
              })
            ),
          })
        }

        // Which technicians this restore actually has, for the time entries
        // nested inside each service record. Read back rather than taken from
        // the file, so an older backup whose technicians were skipped does not
        // claim rows that were never inserted.
        const technicianIds = new Set(
          (
            await tx.technician.findMany({
              where: { organizationId: ctx.organizationId },
              select: { id: true },
            })
          ).map((t) => t.id)
        )

        // Who is in this workshop, for the jobs and quotes that name the
        // person who opened or unlocked them.
        const memberUserIds = new Set(
          (
            await tx.organizationMember.findMany({
              where: { organizationId: ctx.organizationId },
              select: { userId: true },
            })
          ).map((m) => m.userId)
        )

        // Each technician's time off, for the technicians this restore has.
        const absences = ((data.technicians as Record<string, unknown>[] | undefined) ?? [])
          .flatMap((t) => (t.absences as Record<string, unknown>[] | undefined) ?? [])
          .filter((a) => technicianIds.has(a.technicianId as string))
        await restoreRows(
          'time off',
          (rows) => tx.technicianAbsence.createMany({ data: rows as never }),
          absences,
          { organizationId: ctx.organizationId }
        )

        // 4b. Insert work bays. Service records and inspections point at them, so
        // they have to exist before either is restored.
        if (data.workBays?.length) {
          await tx.workBay.createMany({
            data: (data.workBays as Record<string, unknown>[]).map(
              (b: Record<string, unknown>) => ({
                id: b.id as string,
                name: b.name as string,
                color: (b.color as string) || '#64748b',
                isActive: b.isActive !== false,
                sortOrder: (b.sortOrder as number) || 0,
                dailyCapacity: numberOr(b.dailyCapacity, 480),
                createdAt: toSafeDate(b.createdAt as string),
                updatedAt: toSafeDate(b.updatedAt as string),
                organizationId: ctx.organizationId,
              })
            ),
          })
        }

        // 4c. Insert the workshop's own work order statuses. Service records
        // point at them, so they have to exist before any job is restored.
        const workOrderStatusIds = new Set<string>()
        if (data.workOrderStatuses?.length) {
          const rows = (data.workOrderStatuses as Record<string, unknown>[]).filter(
            (s) => typeof s.id === 'string' && typeof s.name === 'string' && isStage(s.stage)
          )
          await tx.workOrderStatus.createMany({
            data: rows.map((s) => ({
              id: s.id as string,
              name: s.name as string,
              stage: s.stage as string,
              color: (s.color as string) || 'slate',
              sortOrder: (s.sortOrder as number) || 0,
              notifyCustomer: s.notifyCustomer === true,
              messageTemplate: (s.messageTemplate as string) || null,
              archivedAt: s.archivedAt ? toSafeDate(s.archivedAt as string) : null,
              createdAt: toSafeDate(s.createdAt as string),
              updatedAt: toSafeDate(s.updatedAt as string),
              organizationId: ctx.organizationId,
            })),
          })
          for (const s of rows) workOrderStatusIds.add(s.id as string)
        }

        // 5. Insert custom field definitions
        if (data.customFieldDefinitions?.length) {
          for (const def of data.customFieldDefinitions as Record<string, unknown>[]) {
            await tx.customFieldDefinition.create({
              data: {
                id: def.id as string,
                name: def.name as string,
                label: def.label as string,
                fieldType: (def.fieldType as string) || 'text',
                options: (def.options as string) || null,
                defaultValue: (def.defaultValue as string) || null,
                required: (def.required as boolean) || false,
                entityType: def.entityType as string,
                sortOrder: (def.sortOrder as number) || 0,
                isActive: def.isActive !== false,
                createdAt: toSafeDate(def.createdAt as string),
                updatedAt: toSafeDate(def.updatedAt as string),
                userId: ctx.userId,
                organizationId: ctx.organizationId,
              },
            })

            // Insert associated custom field values
            const values = def.values as Record<string, unknown>[] | undefined
            if (values?.length) {
              await tx.customFieldValue.createMany({
                data: values.map((v) => ({
                  id: v.id as string,
                  value: v.value as string,
                  entityId: v.entityId as string,
                  entityType: v.entityType as string,
                  fieldId: def.id as string,
                })),
              })
            }
          }
        }

        // 5. Insert inventory parts
        if (data.inventoryParts?.length) {
          await tx.inventoryPart.createMany({
            data: (data.inventoryParts as Record<string, unknown>[]).map(
              (p: Record<string, unknown>) => ({
                id: p.id as string,
                partNumber: (p.partNumber as string) || null,
                barcode: (p.barcode as string) || null,
                name: p.name as string,
                description: (p.description as string) || null,
                category: (p.category as string) || null,
                quantity: (p.quantity as number) || 0,
                minQuantity: (p.minQuantity as number) || 0,
                // Backups from before the switch have none: every part counted.
                trackStock: p.trackStock !== false,
                unit: (p.unit as string) || null,
                unitCost: (p.unitCost as number) || 0,
                sellPrice: (p.sellPrice as number) || 0,
                supplier: (p.supplier as string) || null,
                supplierPhone: (p.supplierPhone as string) || null,
                supplierEmail: (p.supplierEmail as string) || null,
                supplierUrl: (p.supplierUrl as string) || null,
                imageUrl: rewriteFileUrl(p.imageUrl as string, ctx.organizationId),
                location: (p.location as string) || null,
                isArchived: (p.isArchived as boolean) || false,
                // Backups from before tags have none.
                tags: Array.isArray(p.tags)
                  ? (p.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string')
                  : [],
                // When the low stock alert went out, so it is not sent again.
                lowStockAlertedAt: p.lowStockAlertedAt
                  ? (toSafeDate(p.lowStockAlertedAt as string) ?? null)
                  : null,
                createdAt: toSafeDate(p.createdAt as string),
                updatedAt: toSafeDate(p.updatedAt as string),
                userId: ctx.userId,
                organizationId: ctx.organizationId,
              })
            ),
          })

          for (const part of data.inventoryParts as Record<string, unknown>[]) {
            await restoreRows(
              'inventory images',
              (rows) => tx.storedImage.createMany({ data: rows as never }),
              part.gallery,
              {},
              { fields: ['url'], organizationId: ctx.organizationId }
            )
          }
        }

        // Resolve work day start time from imported settings for backfilling service record times
        const workDayStartSetting = (data.settings as Record<string, unknown>[] | undefined)?.find(
          (s) => s.key === 'workboard.workDayStart'
        )
        const workDayStartTime = (workDayStartSetting?.value as string) || '07:00'
        const importedSetting = (key: string) =>
          (data.settings as Record<string, unknown>[] | undefined)?.find((s) => s.key === key)
            ?.value as string | undefined
        const timeZone = resolveWorkshopTimeZone(
          importedSetting(SETTING_KEYS.TIMEZONE),
          importedSetting(SETTING_KEYS.TIMEZONE_DETECTED)
        )

        // 6. Insert vehicles with nested data
        if (data.vehicles?.length) {
          for (const v of data.vehicles as Record<string, unknown>[]) {
            await tx.vehicle.create({
              data: {
                id: v.id as string,
                make: v.make as string,
                model: v.model as string,
                year: restoredVehicleYear(v.year),
                vin: (v.vin as string) || null,
                licensePlate: normalizePlate(v.licensePlate as string | null | undefined),
                color: (v.color as string) || null,
                mileage: (v.mileage as number) || 0,
                fuelType: (v.fuelType as string) || null,
                transmission: (v.transmission as string) || null,
                engineSize: (v.engineSize as string) || null,
                engineCode: (v.engineCode as string) || null,
                hsn: (v.hsn as string) || null,
                tsn: (v.tsn as string) || null,
                fleetNumber: (v.fleetNumber as string) || null,
                bodyType: (v.bodyType as string) || null,
                purchaseDate: toSafeDate(v.purchaseDate as string) ?? null,
                purchasePrice: numberOr(v.purchasePrice, null),
                imageUrl: rewriteFileUrl(v.imageUrl as string, ctx.organizationId),
                isArchived: (v.isArchived as boolean) || false,
                archiveReason: (v.archiveReason as string) || null,
                soldReportedAt: v.soldReportedAt
                  ? (toSafeDate(v.soldReportedAt as string) ?? null)
                  : null,
                maintenanceDismissed: (v.maintenanceDismissed as boolean) || false,
                maintenanceDismissedAt: v.maintenanceDismissedAt
                  ? (toSafeDate(v.maintenanceDismissedAt as string) ?? null)
                  : null,
                createdAt: toSafeDate(v.createdAt as string),
                updatedAt: toSafeDate(v.updatedAt as string),
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                customerId: (v.customerId as string) || null,
              },
            })

            // Notes
            const notes = v.notes as Record<string, unknown>[] | undefined
            if (notes?.length) {
              await tx.note.createMany({
                data: notes.map((n) => ({
                  id: n.id as string,
                  title: n.title as string,
                  content: n.content as string,
                  isPinned: (n.isPinned as boolean) || false,
                  createdAt: toSafeDate(n.createdAt as string),
                  updatedAt: toSafeDate(n.updatedAt as string),
                  vehicleId: v.id as string,
                })),
              })
            }

            // Fuel logs
            const fuelLogs = v.fuelLogs as Record<string, unknown>[] | undefined
            if (fuelLogs?.length) {
              await tx.fuelLog.createMany({
                data: fuelLogs.map((f) => ({
                  id: f.id as string,
                  date: toSafeDate(f.date as string),
                  mileage: f.mileage as number,
                  gallons: f.gallons as number,
                  pricePerGallon: f.pricePerGallon as number,
                  totalCost: f.totalCost as number,
                  isFillUp: f.isFillUp !== false,
                  station: (f.station as string) || null,
                  notes: (f.notes as string) || null,
                  createdAt: toSafeDate(f.createdAt as string),
                  updatedAt: toSafeDate(f.updatedAt as string),
                  vehicleId: v.id as string,
                })),
              })
            }

            // Reminders
            const reminders = v.reminders as Record<string, unknown>[] | undefined
            if (reminders?.length) {
              await tx.reminder.createMany({
                data: reminders.map((r) => ({
                  id: r.id as string,
                  title: r.title as string,
                  description: (r.description as string) || null,
                  dueDate: toSafeDate(r.dueDate as string) ?? null,
                  hasDueTime: (r.hasDueTime as boolean) || false,
                  dueMileage: numberOr(r.dueMileage, null),
                  isCompleted: (r.isCompleted as boolean) || false,
                  notifyInApp: (r.notifyInApp as boolean) ?? true,
                  notifyEmail: (r.notifyEmail as boolean) ?? false,
                  // Already announced: left out, a restore announced it again.
                  notifiedAt: r.notifiedAt ? (toSafeDate(r.notifiedAt as string) ?? null) : null,
                  createdAt: toSafeDate(r.createdAt as string),
                  updatedAt: toSafeDate(r.updatedAt as string),
                  vehicleId: v.id as string,
                  customerId: (r.customerId as string) || null,
                  organizationId: ctx.organizationId,
                })),
              })
            }

            // Service records
            const serviceRecords = v.serviceRecords as Record<string, unknown>[] | undefined
            if (serviceRecords?.length) {
              for (const sr of serviceRecords) {
                await importServiceRecordTree(tx, sr, {
                  organizationId: ctx.organizationId,
                  vehicleId: v.id as string,
                  // Most vehicle jobs have none and follow the vehicle's
                  // customer; one booked online names who booked it.
                  customerId: (sr.customerId as string) || null,
                  workDayStartTime,
                  timeZone,
                  technicianIds,
                  workOrderStatusIds,
                  memberUserIds,
                  designIds,
                  designSnapshotIds,
                  assetSnapshotIds,
                })
              }
            }

            // The job whose reading the vehicle's is, once that job is in. Only
            // one of this vehicle's own jobs from the file: anything else would
            // let a correction on some other job move this vehicle.
            if (v.readingJobId && serviceRecords?.some((sr) => sr.id === v.readingJobId)) {
              await tx.vehicle.updateMany({
                where: { id: v.id as string, organizationId: ctx.organizationId },
                data: {
                  readingJobId: v.readingJobId as string,
                  readingBeforeJob: numberOr(v.readingBeforeJob, null),
                  updatedAt: toSafeDate(v.updatedAt as string),
                },
              })
            }

            // What else a vehicle owns. All of it is deleted with the vehicle,
            // so leaving any of it out makes a restore a one-way loss.
            await restoreRows(
              'service requests',
              (rows) => tx.serviceRequest.createMany({ data: rows as never }),
              v.serviceRequests,
              { organizationId },
              // The customer's photos and video point at this workshop.
              { fields: ['attachments'], organizationId }
            )
            // One row, not a list: the vehicle's inspection deadline and where it came from.
            await restoreRows(
              'inspection status',
              (rows) => tx.vehicleInspectionStatus.createMany({ data: rows as never }),
              v.inspectionStatus ? [v.inspectionStatus] : [],
              { organizationId }
            )
            await restoreRows(
              'AI drafted messages',
              (rows) => tx.aiGeneratedMessage.createMany({ data: rows as never }),
              v.aiMessages
            )

            const recurring = v.recurringInvoices as Record<string, unknown>[] | undefined
            if (recurring?.length) {
              // No organizationId on the row: a recurring invoice is the
              // vehicle's, and the vehicle is this workshop's.
              await restoreRows(
                'recurring invoices',
                (rows) => tx.recurringInvoice.createMany({ data: rows as never }),
                recurring
              )
              for (const invoice of recurring) {
                await restoreRows(
                  'recurring invoice parts',
                  (rows) => tx.recurringPart.createMany({ data: rows as never }),
                  invoice.templateParts
                )
                await restoreRows(
                  'recurring invoice labour',
                  (rows) => tx.recurringLabor.createMany({ data: rows as never }),
                  invoice.templateLabor
                )
              }
            }
          }
        }

        // 6b. Customer/workshop reminders (no vehicle). Older backups don't
        // have this key.
        if (data.orgReminders?.length) {
          await tx.reminder.createMany({
            data: (data.orgReminders as Record<string, unknown>[]).map((r) => ({
              id: r.id as string,
              title: r.title as string,
              description: (r.description as string) || null,
              dueDate: toSafeDate(r.dueDate as string) ?? null,
              hasDueTime: (r.hasDueTime as boolean) || false,
              dueMileage: numberOr(r.dueMileage, null),
              isCompleted: (r.isCompleted as boolean) || false,
              notifyInApp: (r.notifyInApp as boolean) ?? true,
              notifyEmail: (r.notifyEmail as boolean) ?? false,
              notifiedAt: r.notifiedAt ? (toSafeDate(r.notifiedAt as string) ?? null) : null,
              createdAt: toSafeDate(r.createdAt as string),
              updatedAt: toSafeDate(r.updatedAt as string),
              vehicleId: null,
              customerId: (r.customerId as string) || null,
              organizationId: ctx.organizationId,
            })),
          })
        }

        // 6c. Counter sales (service records without a vehicle, linked directly
        // to a customer). Older backups don't have this key.
        if (data.counterSales?.length) {
          for (const sr of data.counterSales as Record<string, unknown>[]) {
            await importServiceRecordTree(tx, sr, {
              organizationId: ctx.organizationId,
              vehicleId: null,
              customerId: (sr.customerId as string) || null,
              workDayStartTime,
              timeZone,
              technicianIds,
              workOrderStatusIds,
              memberUserIds,
              designIds,
              designSnapshotIds,
              assetSnapshotIds,
            })
          }
        }

        // 6d. Rows that point at a service record, once every service record
        // exists. A finding can be resolved in a counter sale, and a stock
        // movement can belong to any job, so neither can be written while its
        // service record is still to come.
        if (data.inventoryParts?.length) {
          for (const part of data.inventoryParts as Record<string, unknown>[]) {
            // The importing user owns the history: the person who moved the
            // stock has no account on this instance.
            await restoreRows(
              'stock movements',
              (rows) => tx.stockMovement.createMany({ data: rows as never }),
              part.movements,
              { organizationId, userId: ctx.userId }
            )
          }
        }
        if (data.vehicles?.length) {
          const findings = (data.vehicles as Record<string, unknown>[]).flatMap((vehicle) =>
            ((vehicle.findings as Record<string, unknown>[] | undefined) ?? []).map((finding) => ({
              finding,
              vehicleId: vehicle.id as string,
            }))
          )
          if (findings.length > 0) {
            // A finding names the job it was found in, the job that resolved it
            // and the concern it answers. Any of the three can be absent from
            // this restore — a counter sale the backup did not carry, a job
            // whose vehicle was left out — and one dangling id fails the whole
            // import, so each is kept only when the row it names is really here.
            const referencedJobs = findings.flatMap(({ finding }) =>
              [finding.serviceRecordId, finding.resolvedServiceRecordId].filter(
                (id): id is string => typeof id === 'string'
              )
            )
            const referencedConcerns = findings
              .map(({ finding }) => finding.concernId)
              .filter((id): id is string => typeof id === 'string')
            // The diagnostic report a fault code was read from, likewise.
            const referencedFiles = findings
              .map(({ finding }) => finding.sourceAttachmentId)
              .filter((id): id is string => typeof id === 'string')
            const [jobRows, concernRows, fileRows] = await Promise.all([
              tx.serviceRecord.findMany({
                where: { id: { in: referencedJobs }, organizationId },
                select: { id: true },
              }),
              tx.serviceConcern.findMany({
                where: { id: { in: referencedConcerns }, serviceRecord: { organizationId } },
                select: { id: true },
              }),
              referencedFiles.length > 0
                ? tx.serviceAttachment.findMany({
                    where: { id: { in: referencedFiles }, serviceRecord: { organizationId } },
                    select: { id: true },
                  })
                : Promise.resolve([]),
            ])
            const restoredJobIds = new Set(jobRows.map((row) => row.id))
            const restoredConcernIds = new Set(concernRows.map((row) => row.id))
            const restoredFileIds = new Set(fileRows.map((row) => row.id))
            const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

            await tx.vehicleFinding.createMany({
              data: findings.map(({ finding, vehicleId: findingVehicleId }) => ({
                id: finding.id as string,
                description: (finding.description as string) || '',
                severity: (finding.severity as string) || 'needs_work',
                status: (finding.status as string) || 'open',
                notes: (finding.notes as string) || null,
                imageUrls: ((finding.imageUrls as string[]) || []).map(
                  (url) => rewriteFileUrl(url, ctx.organizationId) ?? url
                ),
                createdAt: toSafeDate(finding.createdAt as string),
                updatedAt: toSafeDate(finding.updatedAt as string),
                vehicleId: findingVehicleId,
                serviceRecordId: keptReference(finding.serviceRecordId, restoredJobIds),
                resolvedServiceRecordId: keptReference(
                  finding.resolvedServiceRecordId,
                  restoredJobIds
                ),
                concernId: keptReference(finding.concernId, restoredConcernIds),
                faultCode: text(finding.faultCode),
                faultStatus: text(finding.faultStatus),
                faultModule: text(finding.faultModule),
                faultMeaning: text(finding.faultMeaning),
                faultMeaningSource: text(finding.faultMeaningSource),
                sourceAttachmentId: keptReference(finding.sourceAttachmentId, restoredFileIds),
              })),
            })
          }
        }

        // 7. Insert quotes with nested data
        if (data.quotes?.length) {
          for (const q of data.quotes as Record<string, unknown>[]) {
            await tx.quote.create({
              data: {
                id: q.id as string,
                quoteNumber: (q.quoteNumber as string) || null,
                title: q.title as string,
                description: (q.description as string) || null,
                status: (q.status as string) || 'draft',
                validUntil: toSafeDate(q.validUntil as string) ?? null,
                subtotal: (q.subtotal as number) || 0,
                taxRate: (q.taxRate as number) || 0,
                taxAmount: (q.taxAmount as number) || 0,
                taxInclusive: (q.taxInclusive as boolean) ?? false,
                taxComponents: taxComponentsForCopy(q.taxComponents),
                taxableSubtotal: storedTaxableSubtotalFromBackup(q.taxableSubtotal),
                discountType: (q.discountType as string) || null,
                discountValue: (q.discountValue as number) || 0,
                discountAmount: (q.discountAmount as number) || 0,
                totalAmount: (q.totalAmount as number) || 0,
                notes: (q.notes as string) || null,
                ...warrantyFromUntyped(q),
                // The link the customer already holds. Left out, every shared
                // quote answered "not found" after a restore.
                publicToken: (q.publicToken as string) || null,
                sharedAt: toSafeDate(q.sharedAt as string) ?? null,
                shareExpiresAt: toSafeDate(q.shareExpiresAt as string) ?? null,
                shareNeverExpires: q.shareNeverExpires === true,
                shareRenewedAt: toSafeDate(q.shareRenewedAt as string) ?? null,
                viewCount: (q.viewCount as number) || 0,
                lastViewedAt: q.lastViewedAt ? toSafeDate(q.lastViewedAt as string) : null,
                customerMessage: (q.customerMessage as string) || null,
                customerReference: (q.customerReference as string) || null,
                sentAt: q.sentAt ? toSafeDate(q.sentAt as string) : null,
                responseDismissedAt: q.responseDismissedAt
                  ? toSafeDate(q.responseDismissedAt as string)
                  : null,
                editUnlockedAt: q.editUnlockedAt ? toSafeDate(q.editUnlockedAt as string) : null,
                editUnlockedById: keptReference(q.editUnlockedById, memberUserIds),
                convertedToId: (q.convertedToId as string) || null,
                createdAt: toSafeDate(q.createdAt as string),
                updatedAt: toSafeDate(q.updatedAt as string),
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                customerId: (q.customerId as string) || null,
                vehicleId: (q.vehicleId as string) || null,
              },
            })

            // Quote parts
            const partItems = q.partItems as Record<string, unknown>[] | undefined
            if (partItems?.length) {
              await tx.quotePart.createMany({
                data: partItems.map((p, index) => ({
                  id: p.id as string,
                  partNumber: (p.partNumber as string) || null,
                  name: p.name as string,
                  quantity: numberOr(p.quantity, 1),
                  unit: (p.unit as string) || null,
                  category: (p.category as string) || null,
                  unitPrice: (p.unitPrice as number) || 0,
                  total: (p.total as number) || 0,
                  unitCost: (p.unitCost as number) || 0,
                  markupPercent: (p.markupPercent as number) || 0,
                  excluded: (p.excluded as boolean) || false,
                  // Same-transaction inventory restore keeps ids, so the link
                  // carried into ServicePart on conversion stays intact.
                  inventoryPartId: (p.inventoryPartId as string) || null,
                  taxable: p.taxable !== false,
                  // A backup from before lines had an order keeps the order
                  // it was written in.
                  sortOrder: numberOr(p.sortOrder, index),
                  quoteId: q.id as string,
                })),
              })
            }

            // Quote labor
            const laborItems = q.laborItems as Record<string, unknown>[] | undefined
            if (laborItems?.length) {
              await tx.quoteLabor.createMany({
                data: laborItems.map((l, index) => ({
                  id: l.id as string,
                  description: l.description as string,
                  hours: (l.hours as number) || 0,
                  rate: (l.rate as number) || 0,
                  total: (l.total as number) || 0,
                  pricingType: (l.pricingType as string) || 'hourly',
                  // A line the customer declined stays declined; left out, it
                  // came back counted in a total that never included it.
                  excluded: (l.excluded as boolean) || false,
                  taxable: l.taxable !== false,
                  sortOrder: numberOr(l.sortOrder, index),
                  quoteId: q.id as string,
                })),
              })
            }

            // Quote attachments: the drawings and photos a quote was argued
            // with. Their files live in the uploads/quotes folder.
            await restoreRows(
              'quote attachments',
              (rows) => tx.quoteAttachment.createMany({ data: rows as never }),
              q.attachments,
              {},
              { fields: ['fileUrl'], organizationId: ctx.organizationId }
            )
          }
        }

        // 9. Insert inspection templates with nested sections and items
        if (data.inspectionTemplates?.length) {
          for (const tmpl of data.inspectionTemplates as Record<string, unknown>[]) {
            // Every column, including the regulatory profile and the package
            // provenance: a template restored as a bare name would regrade every
            // later inspection on the wrong scale and lose its library link.
            await tx.inspectionTemplate.create({
              data: {
                id: tmpl.id as string,
                name: tmpl.name as string,
                description: (tmpl.description as string) || null,
                isDefault: (tmpl.isDefault as boolean) || false,
                country: (tmpl.country as string) || null,
                standard: (tmpl.standard as string) ?? 'custom',
                severityScale: (tmpl.severityScale as string) || 'eu',
                packageId: (tmpl.packageId as string) || null,
                packageVersion: (tmpl.packageVersion as string) || null,
                packageSource: (tmpl.packageSource as string) || null,
                createdAt: toSafeDate(tmpl.createdAt as string),
                updatedAt: toSafeDate(tmpl.updatedAt as string),
                organizationId: ctx.organizationId,
              },
            })

            const sections = tmpl.sections as Record<string, unknown>[] | undefined
            if (sections?.length) {
              for (const sec of sections) {
                await tx.inspectionTemplateSection.create({
                  data: {
                    id: sec.id as string,
                    name: sec.name as string,
                    description: (sec.description as string) || null,
                    code: (sec.code as string) || null,
                    sortOrder: (sec.sortOrder as number) || 0,
                    templateId: tmpl.id as string,
                  },
                })

                // The whole check definition: what it measures, its limits, its
                // rules and its wording. A check restored as a name alone would
                // stop grading readings and forget that a photo was required.
                const items = sec.items as Record<string, unknown>[] | undefined
                if (items?.length) {
                  await tx.inspectionTemplateItem.createMany({
                    data: items.map((item) => ({
                      id: item.id as string,
                      name: item.name as string,
                      description: (item.description as string) || null,
                      code: (item.code as string) || null,
                      sortOrder: (item.sortOrder as number) || 0,
                      inputType: (item.inputType as string) || 'condition',
                      unit: (item.unit as string) || null,
                      minValue: typeof item.minValue === 'number' ? item.minValue : null,
                      maxValue: typeof item.maxValue === 'number' ? item.maxValue : null,
                      choices: Array.isArray(item.choices) ? (item.choices as string[]) : [],
                      required: item.required === true,
                      photoRequired: item.photoRequired === true,
                      allowNotApplicable: item.allowNotApplicable !== false,
                      defaultSeverity: (item.defaultSeverity as string) || null,
                      defectSuggestions: Array.isArray(item.defectSuggestions)
                        ? (item.defectSuggestions as string[])
                        : [],
                      sectionId: sec.id as string,
                    })),
                  })
                }
              }
            }
          }
        }

        // 10. Insert inspections with items and quote requests
        if (data.inspections?.length) {
          for (const insp of data.inspections as Record<string, unknown>[]) {
            // The certificate fields too: an issued certificate restored without
            // its number, inspector and next test date is not the document that
            // was handed to the customer.
            await tx.inspection.create({
              data: {
                id: insp.id as string,
                status: (insp.status as string) || 'in_progress',
                mileage: numberOr(insp.mileage, null),
                notes: (insp.notes as string) || null,
                startDateTime: toSafeDate(insp.startDateTime as string) ?? null,
                endDateTime: toSafeDate(insp.endDateTime as string) ?? null,
                publicToken: (insp.publicToken as string) || null,
                sharedAt: restoredInspectionSharedAt(insp),
                shareExpiresAt: toSafeDate(insp.shareExpiresAt as string) ?? null,
                shareNeverExpires: insp.shareNeverExpires === true,
                shareRenewedAt: toSafeDate(insp.shareRenewedAt as string) ?? null,
                completedAt: toSafeDate(insp.completedAt as string) ?? null,
                sortOrder: (insp.sortOrder as number) || 0,
                severityScale: (insp.severityScale as string) || null,
                country: (insp.country as string) || null,
                vehicleCategory: (insp.vehicleCategory as string) || null,
                nextTestDue: toSafeDate(insp.nextTestDue as string) ?? null,
                certificateNumber: (insp.certificateNumber as string) || null,
                inspectorName: (insp.inspectorName as string) || null,
                testLocation: (insp.testLocation as string) || null,
                // Import batches are not in a backup, so the row cannot point at
                // one; the same as the relation's own answer when a batch is deleted.
                importBatchId: null,
                // The frozen certificate design, when the snapshot came back too.
                designSnapshotId: keptReference(insp.designSnapshotId, designSnapshotIds),
                signatureSnapshotId: keptReference(insp.signatureSnapshotId, assetSnapshotIds),
                markTypesSnapshot: Array.isArray(insp.markTypesSnapshot)
                  ? (insp.markTypesSnapshot as never)
                  : undefined,
                createdAt: toSafeDate(insp.createdAt as string),
                updatedAt: toSafeDate(insp.updatedAt as string),
                vehicleId: insp.vehicleId as string,
                templateId: insp.templateId as string,
                technicianId: (insp.technicianId as string) || null,
                workBayId: (insp.workBayId as string) || null,
                organizationId: ctx.organizationId,
              },
            })

            // Each check as it was copied from the template and then graded:
            // the reading, the limits it was graded against, the rules and the
            // free text, not only the grade and the note.
            const inspItems = insp.items as Record<string, unknown>[] | undefined
            if (inspItems?.length) {
              await tx.inspectionItem.createMany({
                data: inspItems.map((item) => ({
                  id: item.id as string,
                  name: item.name as string,
                  section: item.section as string,
                  sortOrder: (item.sortOrder as number) || 0,
                  condition: (item.condition as string) || 'not_inspected',
                  notes: (item.notes as string) || null,
                  imageUrls: ((item.imageUrls as string[]) || []).map(
                    (url) => rewriteFileUrl(url, ctx.organizationId) ?? url
                  ),
                  description: (item.description as string) || null,
                  code: (item.code as string) || null,
                  sectionCode: (item.sectionCode as string) || null,
                  inputType: (item.inputType as string) || 'condition',
                  unit: (item.unit as string) || null,
                  minValue: typeof item.minValue === 'number' ? item.minValue : null,
                  maxValue: typeof item.maxValue === 'number' ? item.maxValue : null,
                  choices: Array.isArray(item.choices) ? (item.choices as string[]) : [],
                  required: item.required === true,
                  photoRequired: item.photoRequired === true,
                  allowNotApplicable: item.allowNotApplicable !== false,
                  defaultSeverity: (item.defaultSeverity as string) || null,
                  defectSuggestions: Array.isArray(item.defectSuggestions)
                    ? (item.defectSuggestions as string[])
                    : [],
                  measuredValue: typeof item.measuredValue === 'number' ? item.measuredValue : null,
                  textValue: (item.textValue as string) || null,
                  inspectionId: insp.id as string,
                })),
              })
            }

            const inspFiles = insp.attachments as Record<string, unknown>[] | undefined
            if (inspFiles?.length) {
              await tx.inspectionAttachment.createMany({
                data: inspFiles.map((file) => ({
                  id: file.id as string,
                  fileName: file.fileName as string,
                  fileUrl:
                    rewriteFileUrl(file.fileUrl as string, ctx.organizationId) ??
                    (file.fileUrl as string),
                  fileType: file.fileType as string,
                  fileSize: (file.fileSize as number) || 0,
                  category: (file.category as string) || 'image',
                  description: (file.description as string) || null,
                  includeInReport: file.includeInReport !== false,
                  createdAt: toSafeDate(file.createdAt as string),
                  inspectionId: insp.id as string,
                })),
              })
            }

            // Status reports sent from the inspection, as a job's are restored
            // with the job.
            await restoreRows(
              'inspection status reports',
              (rows) => tx.statusReport.createMany({ data: rows as never }),
              insp.statusReports,
              { organizationId: ctx.organizationId, inspectionId: insp.id as string },
              { fields: ['videoUrl'], organizationId: ctx.organizationId }
            )

            const quoteReqs = insp.quoteRequests as Record<string, unknown>[] | undefined
            if (quoteReqs?.length) {
              await tx.inspectionQuoteRequest.createMany({
                data: quoteReqs.map((qr) => ({
                  id: qr.id as string,
                  status: (qr.status as string) || 'pending',
                  message: (qr.message as string) || null,
                  selectedItemIds: (qr.selectedItemIds as string[]) || [],
                  createdAt: toSafeDate(qr.createdAt as string),
                  inspectionId: insp.id as string,
                  organizationId: ctx.organizationId,
                })),
              })
            }
          }
        }

        // 10b. The jobs and quotes raised from an inspection point back at it.
        // Both were restored before the inspections existed, so the link is
        // written now, to any inspection the workshop holds at this point:
        // one that came back with the backup, or one that was never cleared
        // because the backup did not carry inspections at all.
        {
          const restoredInspections = new Set(
            (
              await tx.inspection.findMany({
                where: { organizationId: ctx.organizationId },
                select: { id: true },
              })
            ).map((insp) => insp.id)
          )
          const linked = (rows: unknown) =>
            ((rows as Record<string, unknown>[] | undefined) ?? []).filter(
              (row) =>
                typeof row.inspectionId === 'string' && restoredInspections.has(row.inspectionId)
            )
          const jobs = [
            ...((data.vehicles as Record<string, unknown>[] | undefined) ?? []).flatMap((vehicle) =>
              linked(vehicle.serviceRecords)
            ),
            ...linked(data.counterSales),
          ]
          // The row's own "last changed" is written with the link: left to the
          // database, every linked job and quote came back changed today.
          for (const sr of jobs) {
            await tx.serviceRecord.updateMany({
              where: { id: sr.id as string, organizationId: ctx.organizationId },
              data: {
                inspectionId: sr.inspectionId as string,
                updatedAt: toSafeDate(sr.updatedAt as string),
              },
            })
          }
          for (const q of linked(data.quotes)) {
            await tx.quote.updateMany({
              where: { id: q.id as string, organizationId: ctx.organizationId },
              data: {
                inspectionId: q.inspectionId as string,
                updatedAt: toSafeDate(q.updatedAt as string),
              },
            })
          }
        }

        // 10a. Equipment: the workshop's kinds, then each item on a vehicle
        // that came back, with where it has been and the jobs and quotes that
        // worked on it. After the vehicles, the jobs and the quotes, and
        // before the meters, which an item can carry. A job or quote the
        // workshop no longer has leaves its link out; a vehicle it no longer
        // has leaves out the item on it, or the stretch of history there.
        const strings = (values: unknown[]) =>
          values.filter((id): id is string => typeof id === 'string')
        const rowsOf = (value: unknown) => (value as Record<string, unknown>[] | undefined) ?? []
        if (data.equipmentTypes?.length) {
          const types = data.equipmentTypes as Record<string, unknown>[]
          await tx.equipmentType.createMany({
            data: types.map((type) => ({
              id: type.id as string,
              name: type.name as string,
              sortOrder: (type.sortOrder as number) || 0,
              isActive: type.isActive !== false,
              createdAt: toSafeDate(type.createdAt as string),
              updatedAt: toSafeDate(type.updatedAt as string),
              organizationId,
            })),
          })
          const items = types.flatMap((type) =>
            rowsOf(type.items).map((item) => ({ item, typeId: type.id as string }))
          )
          const [vehicleRows, jobRows, quoteRows] = await Promise.all([
            tx.vehicle.findMany({
              where: {
                id: {
                  in: strings(
                    items.flatMap(({ item }) => [
                      item.vehicleId,
                      ...rowsOf(item.fittings).map((fitting) => fitting.vehicleId),
                    ])
                  ),
                },
                organizationId,
              },
              select: { id: true },
            }),
            tx.serviceRecord.findMany({
              where: {
                id: {
                  in: strings(
                    items.flatMap(({ item }) => rowsOf(item.jobs).map((l) => l.serviceRecordId))
                  ),
                },
                organizationId,
              },
              select: { id: true },
            }),
            tx.quote.findMany({
              where: {
                id: {
                  in: strings(
                    items.flatMap(({ item }) => rowsOf(item.quotes).map((l) => l.quoteId))
                  ),
                },
                organizationId,
              },
              select: { id: true },
            }),
          ])
          const vehicles = new Set(vehicleRows.map((row) => row.id))
          const jobs = new Set(jobRows.map((row) => row.id))
          const quotes = new Set(quoteRows.map((row) => row.id))
          const fitted = items.filter(({ item }) => vehicles.has(item.vehicleId as string))
          if (fitted.length > 0) {
            await tx.equipmentItem.createMany({
              data: fitted.map(({ item, typeId }) => ({
                id: item.id as string,
                make: (item.make as string) ?? null,
                model: (item.model as string) ?? null,
                serialNumber: (item.serialNumber as string) ?? null,
                manufactureYear: (item.manufactureYear as number) ?? null,
                manufactureDate: toSafeDate(item.manufactureDate as string) ?? null,
                installDate: toSafeDate(item.installDate as string) ?? null,
                notes: (item.notes as string) ?? null,
                ratedCapacity: (item.ratedCapacity as string) ?? null,
                nextExaminationDue: toSafeDate(item.nextExaminationDue as string) ?? null,
                lastExaminedAt: toSafeDate(item.lastExaminedAt as string) ?? null,
                certificateReference: (item.certificateReference as string) ?? null,
                // The examination report, in the vehicles folder this restore writes.
                reportFileUrl: rewriteFileUrl(item.reportFileUrl as string, organizationId),
                reportFileName: (item.reportFileName as string) ?? null,
                removedAt: toSafeDate(item.removedAt as string) ?? null,
                createdAt: toSafeDate(item.createdAt as string),
                updatedAt: toSafeDate(item.updatedAt as string),
                typeId,
                vehicleId: item.vehicleId as string,
                organizationId,
              })),
            })
            await tx.equipmentFitting.createMany({
              data: fitted.flatMap(({ item }) =>
                rowsOf(item.fittings)
                  .filter((fitting) => vehicles.has(fitting.vehicleId as string))
                  .map((fitting) => ({
                    id: fitting.id as string,
                    fittedAt: toSafeDate(fitting.fittedAt as string),
                    endedAt: toSafeDate(fitting.endedAt as string) ?? null,
                    endReason: (fitting.endReason as string) ?? null,
                    itemId: item.id as string,
                    vehicleId: fitting.vehicleId as string,
                    organizationId,
                  }))
              ),
            })
            await tx.serviceRecordEquipment.createMany({
              data: fitted.flatMap(({ item }) =>
                rowsOf(item.jobs)
                  .filter((link) => jobs.has(link.serviceRecordId as string))
                  .map((link) => ({
                    serviceRecordId: link.serviceRecordId as string,
                    itemId: item.id as string,
                    createdAt: toSafeDate(link.createdAt as string),
                    organizationId,
                  }))
              ),
            })
            await tx.quoteEquipment.createMany({
              data: fitted.flatMap(({ item }) =>
                rowsOf(item.quotes)
                  .filter((link) => quotes.has(link.quoteId as string))
                  .map((link) => ({
                    quoteId: link.quoteId as string,
                    itemId: item.id as string,
                    createdAt: toSafeDate(link.createdAt as string),
                    organizationId,
                  }))
              ),
            })
          }
        }

        // 10a, for a file without equipment: the items the workshop had, on
        // the vehicles that are there now, with where they have been.
        if (keptEquipment.length > 0) {
          const [vehicleRows, typeRows] = await Promise.all([
            tx.vehicle.findMany({
              where: {
                id: {
                  in: keptEquipment.flatMap((item) => [
                    item.vehicleId,
                    ...item.fittings.map((fitting) => fitting.vehicleId),
                  ]),
                },
                organizationId,
              },
              select: { id: true },
            }),
            tx.equipmentType.findMany({ where: { organizationId }, select: { id: true } }),
          ])
          const vehicles = new Set(vehicleRows.map((row) => row.id))
          const types = new Set(typeRows.map((row) => row.id))
          const back = keptEquipment.filter(
            (item) => vehicles.has(item.vehicleId) && types.has(item.typeId)
          )
          if (back.length > 0) {
            await tx.equipmentItem.createMany({
              data: back.map((item) => ({
                id: item.id,
                make: item.make,
                model: item.model,
                serialNumber: item.serialNumber,
                manufactureYear: item.manufactureYear,
                manufactureDate: item.manufactureDate,
                installDate: item.installDate,
                notes: item.notes,
                ratedCapacity: item.ratedCapacity,
                nextExaminationDue: item.nextExaminationDue,
                lastExaminedAt: item.lastExaminedAt,
                certificateReference: item.certificateReference,
                reportFileUrl: item.reportFileUrl,
                reportFileName: item.reportFileName,
                removedAt: item.removedAt,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                typeId: item.typeId,
                vehicleId: item.vehicleId,
                organizationId,
              })),
            })
            await tx.equipmentFitting.createMany({
              data: back.flatMap((item) =>
                item.fittings
                  .filter((fitting) => vehicles.has(fitting.vehicleId))
                  .map((fitting) => ({
                    id: fitting.id,
                    fittedAt: fitting.fittedAt,
                    endedAt: fitting.endedAt,
                    endReason: fitting.endReason,
                    itemId: fitting.itemId,
                    vehicleId: fitting.vehicleId,
                    organizationId,
                  }))
              ),
            })
          }
        }

        // 10a, the links a file without equipment cannot put back: from the
        // jobs and quotes there now to the items there now. A link still in
        // place (on a job or quote the file did not replace) is left as it is.
        if (keptJobEquipment.length > 0 || keptQuoteEquipment.length > 0) {
          const itemIds = [...keptJobEquipment, ...keptQuoteEquipment].map((l) => l.itemId)
          const [itemRows, jobRows, quoteRows, jobLinks, quoteLinks] = await Promise.all([
            tx.equipmentItem.findMany({
              where: { id: { in: itemIds }, organizationId },
              select: { id: true },
            }),
            tx.serviceRecord.findMany({
              where: { id: { in: keptJobEquipment.map((l) => l.serviceRecordId) }, organizationId },
              select: { id: true },
            }),
            tx.quote.findMany({
              where: { id: { in: keptQuoteEquipment.map((l) => l.quoteId) }, organizationId },
              select: { id: true },
            }),
            tx.serviceRecordEquipment.findMany({
              where: { itemId: { in: itemIds }, organizationId },
              select: { serviceRecordId: true, itemId: true },
            }),
            tx.quoteEquipment.findMany({
              where: { itemId: { in: itemIds }, organizationId },
              select: { quoteId: true, itemId: true },
            }),
          ])
          const items = new Set(itemRows.map((row) => row.id))
          const jobs = new Set(jobRows.map((row) => row.id))
          const quotes = new Set(quoteRows.map((row) => row.id))
          const linkedJobs = new Set(jobLinks.map((l) => `${l.serviceRecordId}:${l.itemId}`))
          const linkedQuotes = new Set(quoteLinks.map((l) => `${l.quoteId}:${l.itemId}`))
          await tx.serviceRecordEquipment.createMany({
            data: keptJobEquipment
              .filter(
                (link) =>
                  items.has(link.itemId) &&
                  jobs.has(link.serviceRecordId) &&
                  !linkedJobs.has(`${link.serviceRecordId}:${link.itemId}`)
              )
              .map((link) => ({
                serviceRecordId: link.serviceRecordId,
                itemId: link.itemId,
                createdAt: link.createdAt,
                organizationId,
              })),
          })
          await tx.quoteEquipment.createMany({
            data: keptQuoteEquipment
              .filter(
                (link) =>
                  items.has(link.itemId) &&
                  quotes.has(link.quoteId) &&
                  !linkedQuotes.has(`${link.quoteId}:${link.itemId}`)
              )
              .map((link) => ({
                quoteId: link.quoteId,
                itemId: link.itemId,
                createdAt: link.createdAt,
                organizationId,
              })),
          })
        }

        // 10b. The workshop's meters, then each vehicle's and each equipment
        // item's meters and their readings: after the vehicles, the items and
        // the jobs, so a vehicle or item the file did not bring back leaves
        // its meter out, and a reading whose job is not here keeps its value
        // without the link.
        if (data.meterTypes?.length) {
          const types = data.meterTypes as Record<string, unknown>[]
          await tx.meterType.createMany({
            data: types.map((type) => ({
              id: type.id as string,
              name: type.name as string,
              unit: (type.unit as string) ?? '',
              sortOrder: (type.sortOrder as number) || 0,
              isActive: type.isActive !== false,
              createdAt: toSafeDate(type.createdAt as string),
              updatedAt: toSafeDate(type.updatedAt as string),
              organizationId,
            })),
          })
          const fitted = types.flatMap((type) =>
            rowsOf(type.vehicleMeters).map((meter) => ({
              meter,
              meterTypeId: type.id as string,
            }))
          )
          const [vehicleRows, itemRows, jobRows] = await Promise.all([
            tx.vehicle.findMany({
              where: {
                id: { in: strings(fitted.map(({ meter }) => meter.vehicleId)) },
                organizationId,
              },
              select: { id: true },
            }),
            tx.equipmentItem.findMany({
              where: {
                id: { in: strings(fitted.map(({ meter }) => meter.equipmentItemId)) },
                organizationId,
              },
              select: { id: true },
            }),
            tx.serviceRecord.findMany({
              where: {
                id: {
                  in: strings(
                    fitted.flatMap(({ meter }) =>
                      rowsOf(meter.readings).map((reading) => reading.serviceRecordId)
                    )
                  ),
                },
                organizationId,
              },
              select: { id: true },
            }),
          ])
          const vehicles = new Set(vehicleRows.map((row) => row.id))
          const items = new Set(itemRows.map((row) => row.id))
          const jobs = new Set(jobRows.map((row) => row.id))
          // Who typed a reading, or marked it wrong, comes back when that
          // person is in this workshop.
          const members = new Set(
            (
              await tx.organizationMember.findMany({
                where: { organizationId },
                select: { userId: true },
              })
            ).map((row) => row.userId)
          )
          const member = (id: unknown) => (typeof id === 'string' && members.has(id) ? id : null)
          // A meter is on a vehicle or on an item, never both.
          const onItem = (meter: Record<string, unknown>) =>
            typeof meter.equipmentItemId === 'string'
          const kept = fitted.filter(({ meter }) =>
            onItem(meter)
              ? items.has(meter.equipmentItemId as string)
              : vehicles.has(meter.vehicleId as string)
          )
          if (kept.length > 0) {
            await tx.vehicleMeter.createMany({
              data: kept.map(({ meter, meterTypeId }) => ({
                id: meter.id as string,
                vehicleId: onItem(meter) ? null : (meter.vehicleId as string),
                equipmentItemId: onItem(meter) ? (meter.equipmentItemId as string) : null,
                meterTypeId,
                removedAt: toSafeDate(meter.removedAt as string) ?? null,
                createdAt: toSafeDate(meter.createdAt as string),
                organizationId,
              })),
            })
            await tx.meterReading.createMany({
              data: kept.flatMap(({ meter }) =>
                rowsOf(meter.readings).map((reading) => ({
                  id: reading.id as string,
                  vehicleMeterId: meter.id as string,
                  value: String(reading.value),
                  readAt: toSafeDate(reading.readAt as string) ?? new Date(),
                  replacedFrom: reading.replacedFrom == null ? null : String(reading.replacedFrom),
                  wrongAt: toSafeDate(reading.wrongAt as string) ?? null,
                  wrongById: member(reading.wrongById),
                  createdById: member(reading.createdById),
                  source: (reading.source as string) || 'backup',
                  createdAt: toSafeDate(reading.createdAt as string),
                  updatedAt: toSafeDate(reading.updatedAt as string),
                  serviceRecordId: jobs.has(reading.serviceRecordId as string)
                    ? (reading.serviceRecordId as string)
                    : null,
                  organizationId,
                }))
              ),
            })
          }
        }

        // 10b, for a file without meters or without equipment: the meters
        // and readings the workshop had, on the vehicles, items, meters and
        // jobs that are there now.
        if (keptMeters.length > 0) {
          const [vehicleRows, itemRows, typeRows, jobRows] = await Promise.all([
            tx.vehicle.findMany({
              where: { id: { in: strings(keptMeters.map((m) => m.vehicleId)) }, organizationId },
              select: { id: true },
            }),
            tx.equipmentItem.findMany({
              where: {
                id: { in: strings(keptMeters.map((m) => m.equipmentItemId)) },
                organizationId,
              },
              select: { id: true },
            }),
            tx.meterType.findMany({ where: { organizationId }, select: { id: true } }),
            tx.serviceRecord.findMany({
              where: {
                id: {
                  in: keptMeters.flatMap((m) =>
                    m.readings.flatMap((r) => (r.serviceRecordId ? [r.serviceRecordId] : []))
                  ),
                },
                organizationId,
              },
              select: { id: true },
            }),
          ])
          const vehicles = new Set(vehicleRows.map((row) => row.id))
          const items = new Set(itemRows.map((row) => row.id))
          const types = new Set(typeRows.map((row) => row.id))
          const jobs = new Set(jobRows.map((row) => row.id))
          // A meter the file already put back (the same id, or one of the
          // same kind on the same vehicle or item) stays as the file has it.
          const placed = await tx.vehicleMeter.findMany({
            where: { organizationId },
            select: { id: true, vehicleId: true, equipmentItemId: true, meterTypeId: true },
          })
          const placedIds = new Set(placed.map((m) => m.id))
          const slot = (m: {
            vehicleId: string | null
            equipmentItemId: string | null
            meterTypeId: string
          }) => `${m.vehicleId ?? ''}:${m.equipmentItemId ?? ''}:${m.meterTypeId}`
          const placedSlots = new Set(placed.map(slot))
          const back = keptMeters.filter(
            (meter) =>
              types.has(meter.meterTypeId) &&
              !placedIds.has(meter.id) &&
              !placedSlots.has(slot(meter)) &&
              (meter.equipmentItemId
                ? items.has(meter.equipmentItemId)
                : meter.vehicleId !== null && vehicles.has(meter.vehicleId))
          )
          if (back.length > 0) {
            await tx.vehicleMeter.createMany({
              data: back.map((meter) => ({
                id: meter.id,
                vehicleId: meter.vehicleId,
                equipmentItemId: meter.equipmentItemId,
                meterTypeId: meter.meterTypeId,
                removedAt: meter.removedAt,
                createdAt: meter.createdAt,
                organizationId,
              })),
            })
            await tx.meterReading.createMany({
              data: back.flatMap((meter) =>
                meter.readings.map((reading) => ({
                  id: reading.id,
                  vehicleMeterId: reading.vehicleMeterId,
                  value: reading.value,
                  readAt: reading.readAt,
                  replacedFrom: reading.replacedFrom,
                  wrongAt: reading.wrongAt,
                  wrongById: reading.wrongById,
                  createdById: reading.createdById,
                  source: reading.source,
                  createdAt: reading.createdAt,
                  updatedAt: reading.updatedAt,
                  serviceRecordId:
                    reading.serviceRecordId && jobs.has(reading.serviceRecordId)
                      ? reading.serviceRecordId
                      : null,
                  organizationId,
                }))
              ),
            })
          }
        }

        // 10c. The condition map's marks. They hang off the vehicle but name
        // the inspection check or the job they were drawn on, so they come
        // after both; a sheet the backup did not carry leaves the mark with no
        // sheet rather than failing the import. Who drew and cleared them
        // comes back when that person is in this workshop.
        if (data.vehicles?.length) {
          const marks = (data.vehicles as Record<string, unknown>[]).flatMap((vehicle) =>
            ((vehicle.conditionMarks as Record<string, unknown>[] | undefined) ?? []).map(
              (mark) => ({
                mark,
                vehicleId: vehicle.id as string,
              })
            )
          )
          if (marks.length > 0) {
            const ids = (key: string) =>
              marks
                .map(({ mark }) => mark[key])
                .filter((id): id is string => typeof id === 'string')
            const [inspectionRows, itemRows, jobRows] = await Promise.all([
              tx.inspection.findMany({
                where: { id: { in: ids('inspectionId') }, organizationId },
                select: { id: true },
              }),
              tx.inspectionItem.findMany({
                where: { id: { in: ids('inspectionItemId') }, inspection: { organizationId } },
                select: { id: true },
              }),
              tx.serviceRecord.findMany({
                where: { id: { in: ids('serviceRecordId') }, organizationId },
                select: { id: true },
              }),
            ])
            const restoredInspectionIds = new Set(inspectionRows.map((row) => row.id))
            const restoredItemIds = new Set(itemRows.map((row) => row.id))
            const restoredJobIds = new Set(jobRows.map((row) => row.id))
            const restoredMarkIds = new Set(marks.map(({ mark }) => mark.id as string))
            await tx.conditionMark.createMany({
              data: marks.map(({ mark, vehicleId: markVehicleId }) => ({
                id: mark.id as string,
                organizationId,
                vehicleId: markVehicleId,
                inspectionId: keptReference(mark.inspectionId, restoredInspectionIds),
                inspectionItemId: keptReference(mark.inspectionItemId, restoredItemIds),
                serviceRecordId: keptReference(mark.serviceRecordId, restoredJobIds),
                bodyType: (mark.bodyType as string) || 'sedan',
                view: (mark.view as string) || 'left',
                panel: (mark.panel as string) || 'hood',
                x: typeof mark.x === 'number' ? mark.x : 0.5,
                y: typeof mark.y === 'number' ? mark.y : 0.5,
                kind: (mark.kind as string) || 'dent',
                severity: (mark.severity as string) || 'minor',
                note: (mark.note as string) || null,
                imageUrls: ((mark.imageUrls as string[]) || []).map(
                  (url) => rewriteFileUrl(url, ctx.organizationId) ?? url
                ),
                recordedAt: toSafeDate(mark.recordedAt as string),
                recordedById: keptReference(mark.recordedById, memberUserIds),
                resolvedAt: toSafeDate(mark.resolvedAt as string) ?? null,
                resolvedById: keptReference(mark.resolvedById, memberUserIds),
                // The newer mark this one was recorded again as. Without it
                // the same dent shows twice on the vehicle.
                carriedToId: keptReference(mark.carriedToId, restoredMarkIds),
                createdAt: toSafeDate(mark.createdAt as string),
                updatedAt: toSafeDate(mark.updatedAt as string),
              })),
            })
          }
        }

        // 11. Insert audit logs
        if (data.auditLogs?.length) {
          await tx.auditLog.createMany({
            data: (data.auditLogs as Record<string, unknown>[]).map(
              (log: Record<string, unknown>) => ({
                id: log.id as string,
                timestamp: toSafeDate(log.timestamp as string),
                action: log.action as string,
                entity: (log.entity as string) || null,
                entityId: (log.entityId as string) || null,
                message: (log.message as string) || null,
                metadata:
                  log.metadata != null ? (log.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
                ip: (log.ip as string) || null,
                userAgent: (log.userAgent as string) || null,
                // Who did it, when that person is in this workshop; an entry
                // by somebody who is not goes to whoever restores, as before.
                userId: keptReference(log.userId, memberUserIds) ?? ctx.userId,
                organizationId: ctx.organizationId,
              })
            ),
          })
        }

        // 12. Insert SMS messages
        if (data.smsMessages?.length) {
          await tx.smsMessage.createMany({
            data: (data.smsMessages as Record<string, unknown>[]).map(
              (msg: Record<string, unknown>) => ({
                id: msg.id as string,
                direction: msg.direction as string,
                fromNumber: msg.fromNumber as string,
                toNumber: msg.toNumber as string,
                body: msg.body as string,
                status: (msg.status as string) || 'queued',
                providerMsgId: (msg.providerMsgId as string) || null,
                errorMessage: (msg.errorMessage as string) || null,
                relatedEntityType: (msg.relatedEntityType as string) || null,
                relatedEntityId: (msg.relatedEntityId as string) || null,
                // Read stays read: left out, every text ever received came
                // back as unread.
                readAt: msg.readAt ? (toSafeDate(msg.readAt as string) ?? null) : null,
                createdAt: toSafeDate(msg.createdAt as string),
                updatedAt: toSafeDate(msg.updatedAt as string),
                organizationId: ctx.organizationId,
                customerId: (msg.customerId as string) || null,
              })
            ),
          })
        }

        // The other two channels, which were never in a backup at all while SMS
        // was. Customers are already in place, so their links survive.
        await restoreRows(
          'WhatsApp messages',
          (rows) => tx.whatsappMessage.createMany({ data: rows as never }),
          data.whatsappMessages,
          { organizationId },
          { fields: ['mediaUrl'], organizationId }
        )
        await restoreRows(
          'Telegram messages',
          (rows) => tx.telegramMessage.createMany({ data: rows as never }),
          data.telegramMessages,
          { organizationId }
        )

        // Mail, with the files that came with it. A message whose customer is
        // not in this workshop after the restore keeps its thread, which reads
        // by address, and only loses the link: a dangling id would fail the
        // whole import on its foreign key.
        if (data.emailMessages?.length) {
          const customerIds = new Set(
            (await tx.customer.findMany({ where: { organizationId }, select: { id: true } })).map(
              (c) => c.id
            )
          )
          const messages = (data.emailMessages as Record<string, unknown>[]).map(
            (m): Record<string, unknown> => ({
              ...m,
              customerId: keptReference(m.customerId, customerIds),
            })
          )
          await restoreRows(
            'email messages',
            (rows) => tx.emailMessage.createMany({ data: rows as never }),
            messages,
            { organizationId }
          )
          // Messages keep their ids, so each attachment points at its own again.
          await restoreRows(
            'email attachments',
            (rows) => tx.emailAttachment.createMany({ data: rows as never }),
            messages.flatMap((m) =>
              ((m.attachments as Record<string, unknown>[] | undefined) ?? []).map((a) => ({
                ...a,
                messageId: m.id,
              }))
            ),
            {},
            { fields: ['url'], organizationId }
          )
        }

        // The chat in the customer portal. A message belongs to a customer, so
        // one whose customer is not in this workshop after the restore has no
        // thread to sit in and is left out. Its author is kept only when that
        // person is a member of this workshop; its photos point at this
        // workshop. Without the chat in the file, the workshop's own messages
        // (read before the customers were replaced) go back as they were.
        const filePortalMessages = data.portalMessages as Record<string, unknown>[] | undefined
        const portalMessages: Record<string, unknown>[] =
          filePortalMessages ?? currentPortalMessages
        if (portalMessages.length) {
          const customerIds = new Set(
            (await tx.customer.findMany({ where: { organizationId }, select: { id: true } })).map(
              (c) => c.id
            )
          )
          const authorIds = portalMessageAuthorIds(portalMessages)
          const members = new Set(
            authorIds.length
              ? (
                  await tx.organizationMember.findMany({
                    where: { organizationId, userId: { in: authorIds } },
                    select: { userId: true },
                  })
                ).map((m) => m.userId)
              : []
          )
          await restoreRows(
            'portal messages',
            (batch) => tx.portalMessage.createMany({ data: batch as never }),
            portalMessageRowsToRestore(portalMessages, customerIds, members),
            { organizationId },
            { fields: ['attachments'], organizationId }
          )
        }

        // Workshop configuration: the kinds of mark, closed days, labour
        // presets, webhooks, report schedules.
        await restoreRows(
          'closed days',
          (rows) => tx.workshopClosure.createMany({ data: rows as never }),
          data.workshopClosures,
          { organizationId }
        )
        const markTypes = data.conditionMarkTypes as Record<string, unknown>[] | undefined
        if (markTypes?.length) {
          await restoreRows(
            'kinds of mark',
            (rows) => tx.conditionMarkType.createMany({ data: rows as never }),
            markTypes,
            { organizationId }
          )
        }
        const laborPresets = data.laborPresets as Record<string, unknown>[] | undefined
        if (laborPresets?.length) {
          await restoreRows(
            'labour presets',
            (rows) => tx.laborPreset.createMany({ data: rows as never }),
            laborPresets,
            {
              organizationId,
              userId: ctx.userId,
            }
          )
          for (const preset of laborPresets) {
            await restoreRows(
              'labour preset items',
              (rows) => tx.laborPresetItem.createMany({ data: rows as never }),
              preset.items
            )
            await restoreRows(
              'labour preset parts',
              (rows) => tx.laborPresetPart.createMany({ data: rows as never }),
              preset.parts
            )
          }
        }
        await restoreRows(
          'webhooks',
          (rows) => tx.webhook.createMany({ data: rows as never }),
          data.webhooks,
          {
            organizationId,
          }
        )
        await restoreRows(
          'report schedules',
          (rows) => tx.reportSchedule.createMany({ data: rows as never }),
          data.reportSchedules,
          { organizationId }
        )

        // Roles fill gaps rather than replace: members still point at the roles
        // they hold, and members are not in a backup.
        const roles = data.roles as Record<string, unknown>[] | undefined
        if (roles?.length) {
          for (const role of roles) {
            // A role is unique by id and again by name, and an organisation
            // already has its default roles by the time anyone restores a file.
            const existing = await tx.role.findFirst({
              where: {
                organizationId,
                OR: [{ id: role.id as string }, { name: role.name as string }],
              },
            })
            if (existing) continue
            await tx.role.create({ data: columnsOf(role, { organizationId }) as never })
            await restoreRows(
              'role permissions',
              (rows) => tx.permission.createMany({ data: rows as never }),
              role.permissions
            )
          }
        }

        // 13. Insert notifications
        if (data.notifications?.length) {
          await tx.notification.createMany({
            data: (data.notifications as Record<string, unknown>[]).map(
              (n: Record<string, unknown>) => ({
                id: n.id as string,
                type: n.type as string,
                title: n.title as string,
                message: n.message as string,
                entityType: n.entityType as string,
                entityId: n.entityId as string,
                entityUrl: n.entityUrl as string,
                read: (n.read as boolean) || false,
                createdAt: toSafeDate(n.createdAt as string),
                organizationId: ctx.organizationId,
              })
            ),
          })
        }

        // 14. Insert scheduled messages. Last, because they point at customers
        // and vehicles, which are already in by this stage.
        if (data.scheduledMessages?.length) {
          await tx.scheduledMessage.createMany({
            // A message with no readable send time has nothing to act on, so it
            // is dropped rather than restored to an invented moment
            data: (data.scheduledMessages as Record<string, unknown>[])
              .filter((msg: Record<string, unknown>) => !!toSafeDate(msg.sendAt as string))
              .map((msg: Record<string, unknown>) => ({
                id: msg.id as string,
                channel: msg.channel as string,
                subject: (msg.subject as string) || null,
                body: msg.body as string,
                recipient: (msg.recipient as string) || null,
                status: (msg.status as string) || 'scheduled',
                sendAt: toSafeDate(msg.sendAt as string)!,
                frequency: (msg.frequency as string) || 'once',
                endDate: msg.endDate ? toSafeDate(msg.endDate as string) : null,
                lastRunAt: msg.lastRunAt ? toSafeDate(msg.lastRunAt as string) : null,
                sentAt: msg.sentAt ? toSafeDate(msg.sentAt as string) : null,
                runCount: (msg.runCount as number) || 0,
                errorMessage: (msg.errorMessage as string) || null,
                createdAt: toSafeDate(msg.createdAt as string),
                updatedAt: toSafeDate(msg.updatedAt as string),
                organizationId: ctx.organizationId,
                customerId: (msg.customerId as string) || null,
                vehicleId: (msg.vehicleId as string) || null,
                // The author of the backup may not exist here; the importing
                // user owns the restored rows, as everywhere else in this file
                createdById: ctx.userId,
              })),
          })
        }

        // 14b. Reminder campaigns and their send rows, after the messages, the
        // customers and the vehicles they point at. A send whose vehicle or
        // customer is not in this restore is left out rather than invented,
        // and one whose message is missing keeps everything but the message link.
        if (data.inspectionReminderCampaigns?.length) {
          await restoreRows(
            'reminder campaigns',
            (rows) => tx.inspectionReminderCampaign.createMany({ data: rows as never }),
            data.inspectionReminderCampaigns,
            { organizationId, createdById: ctx.userId }
          )
          const vehicleIds = new Set(
            ((data.vehicles as Record<string, unknown>[] | undefined) ?? []).map(
              (v) => v.id as string
            )
          )
          const customerIds = new Set(
            ((data.customers as Record<string, unknown>[] | undefined) ?? []).map(
              (c) => c.id as string
            )
          )
          const messageIds = new Set(
            ((data.scheduledMessages as Record<string, unknown>[] | undefined) ?? []).map(
              (m) => m.id as string
            )
          )
          const sends = (
            (data.inspectionReminderSends as Record<string, unknown>[] | undefined) ?? []
          )
            .filter(
              (row) =>
                vehicleIds.has(row.vehicleId as string) && customerIds.has(row.customerId as string)
            )
            .map((row) => ({
              ...row,
              scheduledMessageId: messageIds.has(row.scheduledMessageId as string)
                ? row.scheduledMessageId
                : null,
            }))
          await restoreRows(
            'reminder sends',
            (rows) => tx.inspectionReminderSend.createMany({ data: rows as never }),
            sends,
            { organizationId }
          )
        }

        // 14c. The calendar's appointments, then the alerts set on them and on
        // booked jobs. After the customers, vehicles and jobs they point at,
        // and each link is kept only when its row is really here: one this
        // restore cleared or left out would fail the whole import on its
        // foreign key. An appointment with no readable time has nothing to
        // put on the calendar and is left out; an alert left pointing at
        // neither an appointment nor a job goes with it. The people who booked
        // them and set the alerts are kept when they are members of this
        // workshop today, and are the importing user otherwise, so an alert
        // that mails the workshop still reaches someone.
        if (data.appointments?.length || data.appointmentNotifications?.length) {
          const idsIn = (rows: Record<string, unknown>[], column: string) => [
            ...new Set(
              rows
                .map((row) => row[column])
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
            ),
          ]
          const appointments = (
            (data.appointments as Record<string, unknown>[] | undefined) ?? []
          ).filter(
            (a) =>
              typeof a.id === 'string' &&
              typeof a.title === 'string' &&
              !!toSafeDate(a.startAt as string) &&
              !!toSafeDate(a.endAt as string)
          )
          const alerts = (
            (data.appointmentNotifications as Record<string, unknown>[] | undefined) ?? []
          ).filter(
            (n) =>
              typeof n.id === 'string' &&
              typeof n.channel === 'string' &&
              typeof n.unit === 'string' &&
              Number.isInteger(n.amount)
          )

          const people = [
            ...new Set([...idsIn(appointments, 'createdById'), ...idsIn(alerts, 'userId')]),
          ]
          const customerIds = idsIn(appointments, 'customerId')
          const vehicleIds = idsIn(appointments, 'vehicleId')
          const [memberRows, customerRows, vehicleRows] = await Promise.all([
            people.length
              ? tx.organizationMember.findMany({
                  where: { organizationId, userId: { in: people } },
                  select: { userId: true },
                })
              : Promise.resolve([]),
            customerIds.length
              ? tx.customer.findMany({
                  where: { id: { in: customerIds }, organizationId },
                  select: { id: true },
                })
              : Promise.resolve([]),
            vehicleIds.length
              ? tx.vehicle.findMany({
                  where: { id: { in: vehicleIds }, organizationId },
                  select: { id: true },
                })
              : Promise.resolve([]),
          ])
          const memberIds = new Set(memberRows.map((m) => m.userId))
          const restoredCustomers = new Set(customerRows.map((row) => row.id))
          const restoredVehicles = new Set(vehicleRows.map((row) => row.id))

          await restoreRows(
            'appointments',
            (rows) => tx.appointment.createMany({ data: rows as never }),
            appointments.map((a) => ({
              id: a.id as string,
              title: a.title as string,
              description: typeof a.description === 'string' ? a.description : null,
              startAt: toSafeDate(a.startAt as string),
              endAt: toSafeDate(a.endAt as string),
              createdAt: toSafeDate(a.createdAt as string),
              updatedAt: toSafeDate(a.updatedAt as string),
              customerId: keptReference(a.customerId, restoredCustomers),
              vehicleId: keptReference(a.vehicleId, restoredVehicles),
              createdById: keptReference(a.createdById, memberIds) ?? ctx.userId,
            })),
            { organizationId }
          )

          const appointmentIds = idsIn(alerts, 'appointmentId')
          const jobIds = idsIn(alerts, 'serviceRecordId')
          const [appointmentRows, jobRows] = await Promise.all([
            appointmentIds.length
              ? tx.appointment.findMany({
                  where: { id: { in: appointmentIds }, organizationId },
                  select: { id: true },
                })
              : Promise.resolve([]),
            jobIds.length
              ? tx.serviceRecord.findMany({
                  where: { id: { in: jobIds }, organizationId },
                  select: { id: true },
                })
              : Promise.resolve([]),
          ])
          const restoredAppointments = new Set(appointmentRows.map((row) => row.id))
          const restoredJobs = new Set(jobRows.map((row) => row.id))

          await restoreRows(
            'appointment alerts',
            (rows) => tx.appointmentNotification.createMany({ data: rows as never }),
            alerts
              .map((n) => ({
                id: n.id as string,
                channel: n.channel as string,
                amount: n.amount as number,
                unit: n.unit as string,
                atTime: typeof n.atTime === 'string' ? n.atTime : null,
                // When it last went out, so a restore does not send it again.
                sentForStart: toSafeDate(n.sentForStart as string) ?? null,
                createdAt: toSafeDate(n.createdAt as string),
                updatedAt: toSafeDate(n.updatedAt as string),
                userId: keptReference(n.userId, memberIds) ?? ctx.userId,
                appointmentId: keptReference(n.appointmentId, restoredAppointments),
                serviceRecordId: keptReference(n.serviceRecordId, restoredJobs),
              }))
              .filter((n) => n.appointmentId !== null || n.serviceRecordId !== null),
            { organizationId }
          )
        }

        // 15. Tire hotel. Last, because sets point at customers and vehicles,
        // and shelves have to exist before anything can sit on one.
        if (data.tireWarehouses?.length) {
          for (const wh of data.tireWarehouses as Record<string, unknown>[]) {
            await tx.tireWarehouse.create({
              data: {
                id: wh.id as string,
                name: wh.name as string,
                address: (wh.address as string) || null,
                notes: (wh.notes as string) || null,
                isDefault: (wh.isDefault as boolean) || false,
                isArchived: (wh.isArchived as boolean) || false,
                createdAt: toSafeDate(wh.createdAt as string),
                updatedAt: toSafeDate(wh.updatedAt as string),
                organizationId: ctx.organizationId,
                userId: ctx.userId,
              },
            })

            const locations = wh.locations as Record<string, unknown>[] | undefined
            if (locations?.length) {
              await tx.tireLocation.createMany({
                data: locations.map((loc) => ({
                  id: loc.id as string,
                  code: loc.code as string,
                  zone: (loc.zone as string) || null,
                  rack: (loc.rack as string) || null,
                  shelf: (loc.shelf as string) || null,
                  position: (loc.position as string) || null,
                  capacity: (loc.capacity as number) ?? 0,
                  notes: (loc.notes as string) || null,
                  isArchived: (loc.isArchived as boolean) || false,
                  createdAt: toSafeDate(loc.createdAt as string),
                  updatedAt: toSafeDate(loc.updatedAt as string),
                  warehouseId: wh.id as string,
                  organizationId: ctx.organizationId,
                })),
              })
            }
          }
        }

        if (data.tireSets?.length) {
          // A set whose shelf did not come across is restored unplaced rather
          // than dropped: losing the tires is worse than losing where they sat,
          // and an unplaced set is visible and fixable.
          const knownLocations = new Set(
            (
              await tx.tireLocation.findMany({
                where: { organizationId: ctx.organizationId },
                select: { id: true },
              })
            ).map((l) => l.id)
          )

          for (const set of data.tireSets as Record<string, unknown>[]) {
            const locationId = set.locationId as string | null
            await tx.tireSet.create({
              data: {
                id: set.id as string,
                reference: (set.reference as string) || null,
                season: (set.season as string) || 'summer',
                studded: (set.studded as boolean) || false,
                brand: (set.brand as string) || null,
                model: (set.model as string) || null,
                size: (set.size as string) || null,
                dotCode: (set.dotCode as string) || null,
                loadSpeedIndex: (set.loadSpeedIndex as string) || null,
                withRims: (set.withRims as boolean) || false,
                rimType: (set.rimType as string) || null,
                hasTpms: (set.hasTpms as boolean) || false,
                quantity: numberOr(set.quantity, 4),
                status: (set.status as string) || 'stored',
                notes: (set.notes as string) || null,
                checkedInAt: set.checkedInAt ? toSafeDate(set.checkedInAt as string) : null,
                checkedOutAt: set.checkedOutAt ? toSafeDate(set.checkedOutAt as string) : null,
                createdAt: toSafeDate(set.createdAt as string),
                updatedAt: toSafeDate(set.updatedAt as string),
                locationId: locationId && knownLocations.has(locationId) ? locationId : null,
                vehicleId: (set.vehicleId as string) || null,
                customerId: (set.customerId as string) || null,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
              },
            })

            // Movements first: a reading names the movement it was taken at.
            const movements = set.movements as Record<string, unknown>[] | undefined
            if (movements?.length) {
              await tx.tireMovement.createMany({
                data: movements.map((mv) => ({
                  id: mv.id as string,
                  type: mv.type as string,
                  fromCode: (mv.fromCode as string) || null,
                  toCode: (mv.toCode as string) || null,
                  note: (mv.note as string) || null,
                  createdAt: toSafeDate(mv.createdAt as string),
                  tireSetId: set.id as string,
                  // The codes above carry the history in readable form; the
                  // links come back for the shelves that came across, and
                  // who moved the set when that person is in this workshop.
                  fromLocationId: keptReference(mv.fromLocationId, knownLocations),
                  toLocationId: keptReference(mv.toLocationId, knownLocations),
                  performedById: keptReference(mv.performedById, memberUserIds),
                  organizationId: ctx.organizationId,
                })),
              })
            }

            const restoredMovements = new Set((movements ?? []).map((mv) => mv.id as string))
            const measurements = set.measurements as Record<string, unknown>[] | undefined
            if (measurements?.length) {
              await tx.tireMeasurement.createMany({
                data: measurements.map((m) => ({
                  id: m.id as string,
                  position: (m.position as string) || 'unspecified',
                  treadDepthMm: (m.treadDepthMm as number) ?? null,
                  pressureBar: (m.pressureBar as number) ?? null,
                  condition: (m.condition as string) || 'good',
                  damage: (m.damage as string) || null,
                  notes: (m.notes as string) || null,
                  measuredAt: toSafeDate(m.measuredAt as string),
                  tireSetId: set.id as string,
                  // The person who took the reading may not exist here, and a
                  // wrong name on a condition record is worse than none: kept
                  // only when they are in this workshop.
                  measuredById: keptReference(m.measuredById, memberUserIds),
                  movementId: keptReference(m.movementId, restoredMovements),
                })),
              })

              // The condition photos of each reading. They hang off the
              // measurement and are deleted with it, so a restore without them
              // leaves the reading with no evidence behind it.
              for (const m of measurements) {
                await restoreRows(
                  'tire condition photos',
                  (rows) => tx.storedImage.createMany({ data: rows as never }),
                  m.images,
                  { tireMeasurementId: m.id as string, inventoryPartId: null },
                  { fields: ['url'], organizationId: ctx.organizationId }
                )
              }
            }

            const attachments = set.attachments as Record<string, unknown>[] | undefined
            if (attachments?.length) {
              await tx.tireSetAttachment.createMany({
                data: attachments.map((att) => ({
                  id: att.id as string,
                  fileName: (att.fileName as string) || 'file',
                  fileUrl: rewriteFileUrl(att.fileUrl as string, ctx.organizationId) ?? '',
                  fileType: (att.fileType as string) || 'application/octet-stream',
                  fileSize: (att.fileSize as number) || 0,
                  description: (att.description as string) || null,
                  includeInInvoice: att.includeInInvoice !== false,
                  sortOrder: (att.sortOrder as number) || 0,
                  createdAt: toSafeDate(att.createdAt as string),
                  tireSetId: set.id as string,
                  organizationId: ctx.organizationId,
                  // The uploader may not exist in the target organization.
                  uploadedById: keptReference(att.uploadedById, memberUserIds),
                })),
              })
            }

            const treatments = set.treatments as Record<string, unknown>[] | undefined
            if (treatments?.length) {
              await tx.tireTreatment.createMany({
                data: treatments.map((tr) => ({
                  id: tr.id as string,
                  type: tr.type as string,
                  status: (tr.status as string) || 'pending',
                  notes: (tr.notes as string) || null,
                  completedAt: tr.completedAt ? toSafeDate(tr.completedAt as string) : null,
                  completedById: keptReference(tr.completedById, memberUserIds),
                  createdAt: toSafeDate(tr.createdAt as string),
                  updatedAt: toSafeDate(tr.updatedAt as string),
                  tireSetId: set.id as string,
                  organizationId: ctx.organizationId,
                })),
              })
            }
          }
        }

        // The jobs and quotes raised for a stored set point back at it. Both
        // were restored before the sets existed, so the link is written now,
        // to any set the workshop holds at this point: one that came back with
        // the backup, or one that was never cleared because the backup did not
        // carry the tire hotel.
        {
          const restoredTireSets = new Set(
            (
              await tx.tireSet.findMany({
                where: { organizationId: ctx.organizationId },
                select: { id: true },
              })
            ).map((set) => set.id)
          )
          const aboutASet = (rows: unknown) =>
            ((rows as Record<string, unknown>[] | undefined) ?? []).filter(
              (row) => typeof row.tireSetId === 'string' && restoredTireSets.has(row.tireSetId)
            )
          const jobs = [
            ...((data.vehicles as Record<string, unknown>[] | undefined) ?? []).flatMap((vehicle) =>
              aboutASet(vehicle.serviceRecords)
            ),
            ...aboutASet(data.counterSales),
          ]
          for (const sr of jobs) {
            await tx.serviceRecord.updateMany({
              where: { id: sr.id as string, organizationId: ctx.organizationId },
              data: {
                tireSetId: sr.tireSetId as string,
                updatedAt: toSafeDate(sr.updatedAt as string),
              },
            })
          }
          for (const q of aboutASet(data.quotes)) {
            await tx.quote.updateMany({
              where: { id: q.id as string, organizationId: ctx.organizationId },
              data: {
                tireSetId: q.tireSetId as string,
                updatedAt: toSafeDate(q.updatedAt as string),
              },
            })
          }
        }
      },
      // A restore of years of records takes minutes, not Prisma's five seconds.
      { maxWait: 30_000, timeout: TRANSACTION_TIMEOUT_MS }
    )
  } finally {
    releaseRestoreLock(lock)
  }

  // The rows are committed by now. A failure here (a full disk, a folder
  // that cannot be written) leaves records from the backup beside files that
  // are only partly from it, and the message has to say so.
  if (files) {
    try {
      await restoreFiles(files, ctx.organizationId)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `The records were put back, but copying the files failed: ${reason}. The workshop's records are now from the backup while its files are only partly from it; fix the cause and restore again.`
      )
    }
  }

  return { redactedSettings }
}

/**
 * A backup on disk: `data.json` and, when the backup carried photos and
 * files, the restored uploads folder beside it. This is what a snapshot
 * from a backup destination becomes once restic has written it out.
 */
export async function restoreFromDisk(
  ctx: RestoreActor,
  input: { dataFile: string; filesDir: string | null }
): Promise<{ redactedSettings: string[] }> {
  const backup = await readJsonFile<unknown>(input.dataFile)
  assertSupportedBackup(backup)
  const files = input.filesDir ? await directoryFileSource(input.filesDir) : null
  return restoreBackup(ctx, backup, files)
}
