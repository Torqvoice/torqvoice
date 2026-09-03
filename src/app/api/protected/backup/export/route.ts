import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import JSZip from 'jszip'
import { isDemoMode } from '@/lib/demo'
import { UPLOAD_CATEGORIES } from '@/lib/backup/manifest'
import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'

export const maxDuration = 300

interface ExportOptions {
  settings: boolean
  customers: boolean
  vehicles: boolean
  quotes: boolean
  inventory: boolean
  customFields: boolean
  files: boolean
  technicians: boolean
  inspections: boolean
  auditLogs: boolean
  smsMessages: boolean
  scheduledMessages: boolean
  notifications: boolean
  tireHotel: boolean
  /**
   * Labour presets, roles, webhooks, report schedules and dashboard layout:
   * the settings a workshop builds up that are not key/value AppSettings.
   */
  workshopConfig: boolean
}

const DEFAULT_OPTIONS: ExportOptions = {
  settings: true,
  customers: true,
  vehicles: true,
  quotes: true,
  inventory: true,
  customFields: true,
  files: true,
  technicians: true,
  inspections: true,
  auditLogs: true,
  smsMessages: true,
  scheduledMessages: true,
  notifications: true,
  tireHotel: true,
  workshopConfig: true,
}

export async function POST(request: NextRequest) {
  if (isDemoMode) {
    return NextResponse.json({ error: 'This action is disabled on the demo.' }, { status: 403 })
  }

  const ctx = await getAuthContext()

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let options: ExportOptions = DEFAULT_OPTIONS
  try {
    const body = await request.json()
    if (body?.include) {
      options = { ...DEFAULT_OPTIONS, ...body.include }
    }
  } catch {
    // If no body or invalid JSON, use defaults
  }

  const data: Record<string, unknown> = {}

  const queries: Promise<void>[] = []

  if (options.settings) {
    queries.push(
      db.appSetting.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.settings = result
      })
    )
  }

  if (options.settings) {
    queries.push(
      db.documentDesign
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.documentDesigns = result
        })
    )
  }

  if (options.customers) {
    queries.push(
      db.customer.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.customers = result
      })
    )
  }

  if (options.vehicles) {
    // What issued invoices were issued with. The logo bytes travel as base64,
    // since the file is JSON.
    queries.push(
      db.documentDesignSnapshot
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.documentDesignSnapshots = result
        }),
      db.documentAssetSnapshot
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.documentAssetSnapshots = result.map((row) => ({
            ...row,
            data: Buffer.from(row.data).toString('base64'),
          }))
        })
    )
  }

  if (options.customFields) {
    queries.push(
      db.customFieldDefinition
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { values: true },
        })
        .then((result) => {
          data.customFieldDefinitions = result
        })
    )
  }

  if (options.inventory) {
    queries.push(
      db.inventoryPart
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { movements: true, gallery: true },
        })
        .then((result) => {
          data.inventoryParts = result
        })
    )
  }

  if (options.vehicles) {
    queries.push(
      db.vehicle
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            notes: true,
            fuelLogs: true,
            reminders: true,
            serviceRequests: true,
            inspectionStatus: true,
            serviceRecords: {
              include: {
                concerns: true,
                partItems: true,
                laborItems: true,
                attachments: true,
                payments: true,
                statusReports: true,
                timeEntries: true,
              },
            },
          },
        })
        .then((result) => {
          data.vehicles = result
        })
    )
  }

  if (options.vehicles) {
    // Customer/workshop reminders have no vehicle to nest under.
    queries.push(
      db.reminder
        .findMany({ where: { organizationId: ctx.organizationId, vehicleId: null } })
        .then((result) => {
          data.orgReminders = result
        })
    )
  }

  if (options.vehicles) {
    // Counter sales: service records without a vehicle, linked directly to a
    // customer. They are not nested under any vehicle, so export them
    // separately or they would be lost from backups.
    queries.push(
      db.serviceRecord
        .findMany({
          where: { organizationId: ctx.organizationId, vehicleId: null },
          include: {
            concerns: true,
            partItems: true,
            laborItems: true,
            attachments: true,
            payments: true,
            timeEntries: true,
          },
        })
        .then((result) => {
          data.counterSales = result
        })
    )
  }

  if (options.quotes) {
    queries.push(
      db.quote
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            partItems: true,
            laborItems: true,
            attachments: true,
          },
        })
        .then((result) => {
          data.quotes = result
        })
    )
  }

  if (options.technicians) {
    queries.push(
      db.technician.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.technicians = result
      })
    )
    queries.push(
      db.workBay.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.workBays = result
      })
    )
  }

  if (options.inspections) {
    queries.push(
      db.inspectionTemplate
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            sections: {
              include: { items: true },
            },
          },
        })
        .then((result) => {
          data.inspectionTemplates = result
        })
    )
    queries.push(
      db.inspection
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            items: true,
            quoteRequests: true,
          },
        })
        .then((result) => {
          data.inspections = result
        })
    )
  }

  if (options.tireHotel) {
    // Shelves first, then what sits on them. The sets reference locations by
    // id, so an export missing the warehouses would restore tires with
    // nowhere to put them.
    queries.push(
      db.tireWarehouse
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { locations: true },
        })
        .then((result) => {
          data.tireWarehouses = result
        })
    )
    queries.push(
      db.tireSet
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            measurements: true,
            movements: true,
            treatments: true,
            attachments: true,
          },
        })
        .then((result) => {
          data.tireSets = result
        })
    )
  }

  if (options.workshopConfig) {
    // Everything a workshop configures that is not a key/value setting: none
    // of it was in a backup before, so a restore rebuilt an empty shop.
    queries.push(
      db.laborPreset
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { items: true, parts: true },
        })
        .then((result) => {
          data.laborPresets = result
        })
    )
    queries.push(
      db.webhook.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.webhooks = result
      })
    )
    queries.push(
      db.reportSchedule
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.reportSchedules = result
        })
    )
    queries.push(
      db.role
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { permissions: true },
        })
        .then((result) => {
          data.roles = result
        })
    )
  }

  if (options.auditLogs) {
    queries.push(
      db.auditLog.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.auditLogs = result
      })
    )
  }

  if (options.smsMessages) {
    queries.push(
      db.smsMessage.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.smsMessages = result
      })
    )
    queries.push(
      db.whatsappMessage
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.whatsappMessages = result
        })
    )
    queries.push(
      db.telegramMessage
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.telegramMessages = result
        })
    )
  }

  if (options.scheduledMessages) {
    queries.push(
      db.scheduledMessage
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.scheduledMessages = result
        })
    )
    queries.push(
      db.inspectionReminderCampaign
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.inspectionReminderCampaigns = result
        })
    )
    queries.push(
      db.inspectionReminderSend
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.inspectionReminderSends = result
        })
    )
  }

  if (options.notifications) {
    queries.push(
      db.notification.findMany({ where: { organizationId: ctx.organizationId } }).then((result) => {
        data.notifications = result
      })
    )
  }

  await Promise.all(queries)

  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    data,
  }

  const zip = new JSZip()

  // Add data.json
  zip.file('data.json', JSON.stringify(backup, null, 2))

  // Add uploaded files if requested
  if (options.files) {
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId)

    const categories = UPLOAD_CATEGORIES

    for (const category of categories) {
      const categoryDir = path.join(uploadsDir, category)
      try {
        const dirStat = await stat(categoryDir)
        if (!dirStat.isDirectory()) continue

        const files = await readdir(categoryDir)
        for (const file of files) {
          const filePath = path.join(categoryDir, file)
          const fileStat = await stat(filePath)
          if (!fileStat.isFile()) continue

          const fileBuffer = await readFile(filePath)
          zip.file(`files/${category}/${file}`, fileBuffer)
        }
      } catch {
        // Category directory doesn't exist, skip
      }
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="torqvoice-backup-${dateStr}.zip"`,
    },
  })
}

/**
 * The older, no-options export.
 *
 * It used to be a second implementation of the same thing, and it fell behind:
 * it predated the tire hotel and never learned about anything added since, so
 * whoever called it received a quietly incomplete backup. It now runs the same
 * export as everything else, with every option on.
 */
export async function GET(request: NextRequest) {
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ include: DEFAULT_OPTIONS }),
    })
  )
}
