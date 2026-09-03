import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { clearPlanFor, UPLOAD_CATEGORIES } from '@/lib/backup/manifest'
import { columnsOf } from '@/lib/backup/rows'
import { toSafeDate } from '@/lib/invoice-utils'
import { Prisma } from '@/generated/prisma/client'
import JSZip from 'jszip'
import { mkdir, rm, writeFile } from 'fs/promises'
import path from 'path'

// Zip magic bytes: PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

function isZipBuffer(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer)
  if (view.length < 4) return false
  return ZIP_MAGIC.every((byte, i) => view[i] === byte)
}

interface BackupData {
  version: number
  data: Record<string, any>
}

async function parseBackup(
  request: NextRequest
): Promise<{ backup: BackupData; files: JSZip | null }> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const backup = await request.json()
    return { backup, files: null }
  }

  // For any other content type, read as binary and detect format
  const buffer = await request.arrayBuffer()

  if (isZipBuffer(buffer)) {
    const zip = await JSZip.loadAsync(buffer)
    const dataJsonFile = zip.file('data.json')
    if (!dataJsonFile) {
      throw new Error('Zip archive does not contain data.json')
    }
    const jsonStr = await dataJsonFile.async('string')
    const backup = JSON.parse(jsonStr)
    return { backup, files: zip }
  }

  // Try parsing as JSON (e.g. if content-type header is wrong)
  const text = new TextDecoder().decode(buffer)
  const backup = JSON.parse(text)
  return { backup, files: null }
}

/**
 * Restores one service record with its nested parts/labor/attachments/payments.
 * Used for both vehicle-linked records (nested under vehicles in the backup)
 * and counter sales (top-level records without a vehicle).
 */
async function importServiceRecordTree(
  tx: Prisma.TransactionClient,
  sr: Record<string, unknown>,
  opts: {
    organizationId: string
    vehicleId: string | null
    customerId: string | null
    workDayStartTime: string
    /** Technicians restored by this import. See the time entries below. */
    technicianIds: ReadonlySet<string>
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
      const [h, m] = opts.workDayStartTime.split(':').map(Number)
      startDT = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), h, m, 0, 0)
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
      mileage: (sr.mileage as number) || null,
      serviceDate: toSafeDate(sr.serviceDate as string),
      startDateTime: startDT ?? undefined,
      endDateTime: endDT ?? undefined,
      shopName: (sr.shopName as string) || null,
      techName: (sr.techName as string) || null,
      parts: (sr.parts as string) || null,
      laborHours: (sr.laborHours as number) || null,
      diagnosticNotes: (sr.diagnosticNotes as string) || null,
      invoiceNotes: (sr.invoiceNotes as string) || null,
      subtotal: (sr.subtotal as number) || 0,
      taxRate: (sr.taxRate as number) || 0,
      taxAmount: (sr.taxAmount as number) || 0,
      taxInclusive: (sr.taxInclusive as boolean) ?? false,
      totalAmount: (sr.totalAmount as number) || 0,
      invoiceNumber: (sr.invoiceNumber as string) || null,
      discountType: (sr.discountType as string) || null,
      discountValue: (sr.discountValue as number) || 0,
      discountAmount: (sr.discountAmount as number) || 0,
      publicToken: (sr.publicToken as string) || null,
      technicianId: (sr.technicianId as string) || null,
      workBayId: (sr.workBayId as string) || null,
      sortOrder: (sr.sortOrder as number) || 0,
      createdAt: toSafeDate(sr.createdAt as string),
      updatedAt: toSafeDate(sr.updatedAt as string),
      vehicleId: opts.vehicleId,
      customerId: opts.customerId,
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
        quantity: (p.quantity as number) || 1,
        unit: (p.unit as string) || null,
        unitPrice: (p.unitPrice as number) || 0,
        total: (p.total as number) || 0,
        unitCost: (p.unitCost as number) || 0,
        markupPercent: (p.markupPercent as number) || 0,
        // Inventory parts are restored earlier in this transaction with their
        // ids preserved, so the stock link survives a restore verbatim.
        inventoryPartId: (p.inventoryPartId as string) || null,
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
        serviceRecordId: sr.id as string,
      })),
    })
  }

  // Service attachments
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
    }
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
  override: Record<string, unknown> = {}
) {
  const list = rows as Record<string, unknown>[] | undefined
  if (!list?.length) return

  try {
    await create(list.map((row) => columnsOf(row, override)))
  } catch (error) {
    // A restore rolls back as a whole, so the only thing left to salvage is
    // knowing which part of the file could not be read back.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not restore ${what}: ${reason}`)
  }
}

async function restoreFiles(zip: JSZip, organizationId: string) {
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads', organizationId)

  const fileEntries = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir && (name.startsWith('files/') || name.startsWith('uploads/'))
  )

  // Clear only the folders this backup can refill. Wiping the lot took the
  // portal background and the tire photos with it, and no backup carried
  // either of them back.
  const carried = new Set(
    fileEntries.map((name) => name.split('/')[1]).filter((category) => Boolean(category))
  )
  for (const category of carried) {
    if (!UPLOAD_CATEGORIES.includes(category)) continue
    try {
      await rm(path.join(uploadsDir, category), { recursive: true, force: true })
    } catch {
      // Folder may not exist yet.
    }
  }

  for (const filePath of fileEntries) {
    // Supports both formats:
    //   files/{category}/{filename}  (v2 backup)
    //   uploads/{category}/{filename} (legacy backup)
    const parts = filePath.split('/')
    if (parts.length !== 3) continue

    const category = parts[1]
    const filename = parts[2]

    if (!UPLOAD_CATEGORIES.includes(category)) continue

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) continue

    const targetDir = path.join(uploadsDir, category)
    await mkdir(targetDir, { recursive: true })

    const fileData = await zip.files[filePath].async('nodebuffer')
    await writeFile(path.join(targetDir, filename), fileData)
  }
}

/** Rewrite file URLs to use the importing org's ID */
function rewriteFileUrl(url: string | null | undefined, newOrgId: string): string | null {
  if (!url) return null
  // New format: /api/protected/files/OLD_ORG_ID/category/filename
  if (url.startsWith('/api/protected/files/')) {
    return url.replace(/^\/api\/protected\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`)
  }
  // Old format (pre-restructure): /api/files/OLD_ORG_ID/category/filename
  if (url.startsWith('/api/files/')) {
    return url.replace(/^\/api\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`)
  }
  // Legacy format: /uploads/category/filename → convert to new format
  if (url.startsWith('/uploads/')) {
    const relative = url.replace(/^\/uploads\//, '')
    return `/api/protected/files/${newOrgId}/${relative}`
  }
  return url
}

export async function POST(request: NextRequest) {
  if (isDemoMode) {
    return NextResponse.json({ error: 'Backup import is disabled on the demo.' }, { status: 403 })
  }

  const ctx = await getAuthContext()

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let backup: BackupData
  let zipFiles: JSZip | null = null

  try {
    const result = await parseBackup(request)
    backup = result.backup
    zipFiles = result.files
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid backup file'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (!backup?.version || (backup.version !== 1 && backup.version !== 2)) {
    return NextResponse.json({ error: 'Unsupported or missing backup version' }, { status: 400 })
  }

  const data = backup.data
  if (!data) {
    return NextResponse.json({ error: 'No data found in backup' }, { status: 400 })
  }

  try {
    await db.$transaction(async (tx) => {
      const organizationId = ctx.organizationId

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
        ScheduledMessage: () => tx.scheduledMessage.deleteMany({ where: { organizationId } }),
        InspectionReminderSend: () =>
          tx.inspectionReminderSend.deleteMany({ where: { organizationId } }),
        InspectionReminderCampaign: () =>
          tx.inspectionReminderCampaign.deleteMany({ where: { organizationId } }),
        AuditLog: () => tx.auditLog.deleteMany({ where: { organizationId } }),
        Inspection: () => tx.inspection.deleteMany({ where: { organizationId } }),
        InspectionTemplate: () => tx.inspectionTemplate.deleteMany({ where: { organizationId } }),
        Quote: () => tx.quote.deleteMany({ where: { organizationId } }),
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
        InventoryPart: () => tx.inventoryPart.deleteMany({ where: { organizationId } }),
        Technician: () => tx.technician.deleteMany({ where: { organizationId } }),
        WorkBay: () => tx.workBay.deleteMany({ where: { organizationId } }),
        Customer: () => tx.customer.deleteMany({ where: { organizationId } }),
        LaborPreset: () => tx.laborPreset.deleteMany({ where: { organizationId } }),
        Webhook: () => tx.webhook.deleteMany({ where: { organizationId } }),
        ReportSchedule: () => tx.reportSchedule.deleteMany({ where: { organizationId } }),
        AppSetting: () => tx.appSetting.deleteMany({ where: { organizationId } }),
      }

      for (const model of clearPlanFor(Object.keys(data))) {
        const clear = clearable[model]
        if (clear) await clear()
      }

      // 2. Insert settings
      if (data.settings?.length) {
        await tx.appSetting.createMany({
          data: (data.settings as Record<string, unknown>[]).map((s: Record<string, unknown>) => {
            let value = s.value as string
            // Rewrite file URLs in settings (e.g. logo paths)
            if (value?.startsWith('/api/protected/files/') || value?.startsWith('/api/files/')) {
              value = rewriteFileUrl(value, ctx.organizationId) || value
            }
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

      // 3. Insert customers
      if (data.customers?.length) {
        await tx.customer.createMany({
          data: (data.customers as Record<string, unknown>[]).map((c: Record<string, unknown>) => ({
            id: c.id as string,
            name: c.name as string,
            email: (c.email as string) || null,
            phone: (c.phone as string) || null,
            address: (c.address as string) || null,
            company: (c.company as string) || null,
            notes: (c.notes as string) || null,
            createdAt: toSafeDate(c.createdAt as string),
            updatedAt: toSafeDate(c.updatedAt as string),
            userId: ctx.userId,
            organizationId: ctx.organizationId,
          })),
        })
      }

      // 4. Insert technicians
      if (data.technicians?.length) {
        await tx.technician.createMany({
          data: (data.technicians as Record<string, unknown>[]).map(
            (t: Record<string, unknown>) => ({
              id: t.id as string,
              name: t.name as string,
              color: (t.color as string) || '#3b82f6',
              isActive: t.isActive !== false,
              sortOrder: (t.sortOrder as number) || 0,
              dailyCapacity: (t.dailyCapacity as number) || 480,
              userId: (t.userId as string) || null, // memberId from old backups ignored — no FK to users
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

      // 4b. Insert work bays. Service records and inspections point at them, so
      // they have to exist before either is restored.
      if (data.workBays?.length) {
        await tx.workBay.createMany({
          data: (data.workBays as Record<string, unknown>[]).map((b: Record<string, unknown>) => ({
            id: b.id as string,
            name: b.name as string,
            color: (b.color as string) || '#64748b',
            isActive: b.isActive !== false,
            sortOrder: (b.sortOrder as number) || 0,
            dailyCapacity: (b.dailyCapacity as number) || 480,
            createdAt: toSafeDate(b.createdAt as string),
            updatedAt: toSafeDate(b.updatedAt as string),
            organizationId: ctx.organizationId,
          })),
        })
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
              name: p.name as string,
              description: (p.description as string) || null,
              category: (p.category as string) || null,
              quantity: (p.quantity as number) || 0,
              minQuantity: (p.minQuantity as number) || 0,
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
            part.gallery
          )
        }
      }

      // Resolve work day start time from imported settings for backfilling service record times
      const workDayStartSetting = (data.settings as Record<string, unknown>[] | undefined)?.find(
        (s) => s.key === 'workboard.workDayStart'
      )
      const workDayStartTime = (workDayStartSetting?.value as string) || '07:00'

      // 6. Insert vehicles with nested data
      if (data.vehicles?.length) {
        for (const v of data.vehicles as Record<string, unknown>[]) {
          await tx.vehicle.create({
            data: {
              id: v.id as string,
              make: v.make as string,
              model: v.model as string,
              year: v.year as number,
              vin: (v.vin as string) || null,
              licensePlate: (v.licensePlate as string) || null,
              color: (v.color as string) || null,
              mileage: (v.mileage as number) || 0,
              fuelType: (v.fuelType as string) || null,
              transmission: (v.transmission as string) || null,
              engineSize: (v.engineSize as string) || null,
              purchaseDate: toSafeDate(v.purchaseDate as string) ?? null,
              purchasePrice: (v.purchasePrice as number) || null,
              imageUrl: rewriteFileUrl(v.imageUrl as string, ctx.organizationId),
              isArchived: (v.isArchived as boolean) || false,
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
                dueMileage: (r.dueMileage as number) || null,
                isCompleted: (r.isCompleted as boolean) || false,
                notifyInApp: (r.notifyInApp as boolean) ?? true,
                notifyEmail: (r.notifyEmail as boolean) ?? false,
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
                customerId: null,
                workDayStartTime,
                technicianIds,
              })
            }
          }

          // What else a vehicle owns. All of it is deleted with the vehicle,
          // so leaving any of it out makes a restore a one-way loss.
          await restoreRows(
            'service requests',
            (rows) => tx.serviceRequest.createMany({ data: rows as never }),
            v.serviceRequests,
            { organizationId }
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
            await restoreRows(
              'recurring invoices',
              (rows) => tx.recurringInvoice.createMany({ data: rows as never }),
              recurring,
              { organizationId }
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
            dueMileage: (r.dueMileage as number) || null,
            isCompleted: (r.isCompleted as boolean) || false,
            notifyInApp: (r.notifyInApp as boolean) ?? true,
            notifyEmail: (r.notifyEmail as boolean) ?? false,
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
            technicianIds,
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
        for (const vehicle of data.vehicles as Record<string, unknown>[]) {
          await restoreRows(
            'vehicle findings',
            (rows) => tx.vehicleFinding.createMany({ data: rows as never }),
            vehicle.findings,
            { organizationId }
          )
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
              discountType: (q.discountType as string) || null,
              discountValue: (q.discountValue as number) || 0,
              discountAmount: (q.discountAmount as number) || 0,
              totalAmount: (q.totalAmount as number) || 0,
              notes: (q.notes as string) || null,
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
              data: partItems.map((p) => ({
                id: p.id as string,
                partNumber: (p.partNumber as string) || null,
                name: p.name as string,
                quantity: (p.quantity as number) || 1,
                unit: (p.unit as string) || null,
                unitPrice: (p.unitPrice as number) || 0,
                total: (p.total as number) || 0,
                unitCost: (p.unitCost as number) || 0,
                markupPercent: (p.markupPercent as number) || 0,
                excluded: (p.excluded as boolean) || false,
                // Same-transaction inventory restore keeps ids, so the link
                // carried into ServicePart on conversion stays intact.
                inventoryPartId: (p.inventoryPartId as string) || null,
                quoteId: q.id as string,
              })),
            })
          }

          // Quote labor
          const laborItems = q.laborItems as Record<string, unknown>[] | undefined
          if (laborItems?.length) {
            await tx.quoteLabor.createMany({
              data: laborItems.map((l) => ({
                id: l.id as string,
                description: l.description as string,
                hours: (l.hours as number) || 0,
                rate: (l.rate as number) || 0,
                total: (l.total as number) || 0,
                quoteId: q.id as string,
              })),
            })
          }

          // Quote attachments: the drawings and photos a quote was argued
          // with. Their files live in the uploads/quotes folder.
          await restoreRows(
            'quote attachments',
            (rows) => tx.quoteAttachment.createMany({ data: rows as never }),
            q.attachments
          )
        }
      }

      // 9. Insert inspection templates with nested sections and items
      if (data.inspectionTemplates?.length) {
        for (const tmpl of data.inspectionTemplates as Record<string, unknown>[]) {
          await tx.inspectionTemplate.create({
            data: {
              id: tmpl.id as string,
              name: tmpl.name as string,
              description: (tmpl.description as string) || null,
              isDefault: (tmpl.isDefault as boolean) || false,
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
                  sortOrder: (sec.sortOrder as number) || 0,
                  templateId: tmpl.id as string,
                },
              })

              const items = sec.items as Record<string, unknown>[] | undefined
              if (items?.length) {
                await tx.inspectionTemplateItem.createMany({
                  data: items.map((item) => ({
                    id: item.id as string,
                    name: item.name as string,
                    sortOrder: (item.sortOrder as number) || 0,
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
          await tx.inspection.create({
            data: {
              id: insp.id as string,
              status: (insp.status as string) || 'in_progress',
              mileage: (insp.mileage as number) || null,
              notes: (insp.notes as string) || null,
              startDateTime: toSafeDate(insp.startDateTime as string) ?? null,
              endDateTime: toSafeDate(insp.endDateTime as string) ?? null,
              publicToken: (insp.publicToken as string) || null,
              completedAt: toSafeDate(insp.completedAt as string) ?? null,
              sortOrder: (insp.sortOrder as number) || 0,
              createdAt: toSafeDate(insp.createdAt as string),
              updatedAt: toSafeDate(insp.updatedAt as string),
              vehicleId: insp.vehicleId as string,
              templateId: insp.templateId as string,
              technicianId: (insp.technicianId as string) || null,
              workBayId: (insp.workBayId as string) || null,
              organizationId: ctx.organizationId,
            },
          })

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
                imageUrls: (item.imageUrls as string[]) || [],
                inspectionId: insp.id as string,
              })),
            })
          }

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
              userId: ctx.userId,
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
        { organizationId }
      )
      await restoreRows(
        'Telegram messages',
        (rows) => tx.telegramMessage.createMany({ data: rows as never }),
        data.telegramMessages,
        { organizationId }
      )

      // Workshop configuration: labour presets, webhooks, report schedules.
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
              quantity: (set.quantity as number) || 4,
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
                // wrong name on a condition record is worse than none.
                measuredById: null,
                movementId: null,
              })),
            })
          }

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
                // The codes above carry the history in readable form, so the
                // relations are left off rather than pointed at shelves that
                // may not have come across.
                fromLocationId: null,
                toLocationId: null,
                performedById: null,
                organizationId: ctx.organizationId,
              })),
            })
          }

          const attachments = set.attachments as Record<string, unknown>[] | undefined
          if (attachments?.length) {
            await tx.tireSetAttachment.createMany({
              data: attachments.map((att) => ({
                id: att.id as string,
                fileName: (att.fileName as string) || 'file',
                fileUrl: (att.fileUrl as string) || '',
                fileType: (att.fileType as string) || 'application/octet-stream',
                fileSize: (att.fileSize as number) || 0,
                description: (att.description as string) || null,
                includeInInvoice: att.includeInInvoice !== false,
                sortOrder: (att.sortOrder as number) || 0,
                createdAt: toSafeDate(att.createdAt as string),
                tireSetId: set.id as string,
                organizationId: ctx.organizationId,
                // The uploader may not exist in the target organization.
                uploadedById: null,
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
                completedById: null,
                createdAt: toSafeDate(tr.createdAt as string),
                updatedAt: toSafeDate(tr.updatedAt as string),
                tireSetId: set.id as string,
                organizationId: ctx.organizationId,
              })),
            })
          }
        }
      }
    })

    // Restore files after successful DB transaction
    if (zipFiles) {
      await restoreFiles(zipFiles, ctx.organizationId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[backup/import] Error:', error)
    const message = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
