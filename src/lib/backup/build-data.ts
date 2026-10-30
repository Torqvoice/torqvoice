/**
 * Writes one organisation's backup data.json as a stream.
 *
 * The manual export and the scheduled backups both use it. Every table is
 * read in pages ordered by id and written as it arrives, so a large workshop
 * never sits in memory whole, and an unchanged table writes the same bytes
 * run after run.
 *
 * The output is the shape the import reads:
 * `{"version":2,"exportedAt":"...","data":{"<dataset>":[rows...],...}}`.
 * Dataset names are part of the file format: add, never rename.
 */
import { db } from '@/lib/db'
import { redactSettingRow, redactWebhookRow } from '@/lib/backup/secrets'

export interface ExportOptions {
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

export const DEFAULT_OPTIONS: ExportOptions = {
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

export interface BuildDataOptions extends ExportOptions {
  /** Off by default: secret settings and webhook secrets are written as REDACTED. */
  includeSecrets: boolean
}

const PAGE_SIZE = 500

interface Page {
  take: number
  orderBy: { id: 'asc' }
  cursor?: { id: string }
  skip?: number
}

type Row = { id: string } & Record<string, unknown>

interface Dataset {
  /** Key under `data` in the file. */
  key: string
  option: keyof ExportOptions
  read: (organizationId: string, page: Page) => Promise<Row[]>
  /** Smaller pages for rows that carry a lot (deep trees, logo bytes). */
  pageSize?: number
  /** Applied to each row before it is written. */
  map?: (row: Row, options: BuildDataOptions) => unknown
}

const serviceRecordTree = {
  concerns: true,
  partItems: true,
  laborItems: true,
  attachments: true,
  payments: true,
  statusReports: true,
  timeEntries: true,
} as const

/** In file order. */
const DATASETS: readonly Dataset[] = [
  {
    key: 'settings',
    option: 'settings',
    read: (organizationId, page) => db.appSetting.findMany({ ...page, where: { organizationId } }),
    map: (row, options) =>
      options.includeSecrets ? row : redactSettingRow(row as Row & { key: string; value: string }),
  },
  {
    key: 'documentDesigns',
    option: 'settings',
    read: (organizationId, page) =>
      db.documentDesign.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'emailTemplates',
    option: 'settings',
    read: (organizationId, page) =>
      db.emailTemplate.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'customers',
    option: 'customers',
    read: (organizationId, page) => db.customer.findMany({ ...page, where: { organizationId } }),
  },
  // What issued invoices were issued with. The logo bytes travel as base64,
  // since the file is JSON.
  {
    key: 'documentDesignSnapshots',
    option: 'vehicles',
    read: (organizationId, page) =>
      db.documentDesignSnapshot.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'documentAssetSnapshots',
    option: 'vehicles',
    pageSize: 20,
    read: (organizationId, page) =>
      db.documentAssetSnapshot.findMany({ ...page, where: { organizationId } }),
    map: (row) => ({ ...row, data: Buffer.from(row.data as Uint8Array).toString('base64') }),
  },
  {
    key: 'customFieldDefinitions',
    option: 'customFields',
    read: (organizationId, page) =>
      db.customFieldDefinition.findMany({
        ...page,
        where: { organizationId },
        include: { values: true },
      }),
  },
  {
    key: 'inventoryParts',
    option: 'inventory',
    read: (organizationId, page) =>
      db.inventoryPart.findMany({
        ...page,
        where: { organizationId },
        include: { movements: true, gallery: true },
      }),
  },
  {
    key: 'vehicles',
    option: 'vehicles',
    pageSize: 100,
    read: (organizationId, page) =>
      db.vehicle.findMany({
        ...page,
        where: { organizationId },
        include: {
          notes: true,
          fuelLogs: true,
          reminders: true,
          serviceRequests: true,
          inspectionStatus: true,
          // Findings, condition marks, AI messages and recurring invoices all
          // hang off the vehicle and are deleted with it on a restore, so a
          // backup without them is a one-way loss.
          findings: true,
          conditionMarks: true,
          aiMessages: true,
          recurringInvoices: { include: { templateParts: true, templateLabor: true } },
          serviceRecords: { include: serviceRecordTree },
        },
      }),
  },
  // Customer/workshop reminders have no vehicle to nest under.
  {
    key: 'orgReminders',
    option: 'vehicles',
    read: (organizationId, page) =>
      db.reminder.findMany({ ...page, where: { organizationId, vehicleId: null } }),
  },
  // Counter sales: service records without a vehicle, linked to a customer.
  {
    key: 'counterSales',
    option: 'vehicles',
    pageSize: 100,
    read: (organizationId, page) =>
      db.serviceRecord.findMany({
        ...page,
        where: { organizationId, vehicleId: null },
        include: {
          concerns: true,
          partItems: true,
          laborItems: true,
          attachments: true,
          payments: true,
          timeEntries: true,
        },
      }),
  },
  {
    key: 'quotes',
    option: 'quotes',
    read: (organizationId, page) =>
      db.quote.findMany({
        ...page,
        where: { organizationId },
        include: { partItems: true, laborItems: true, attachments: true },
      }),
  },
  {
    key: 'technicians',
    option: 'technicians',
    read: (organizationId, page) => db.technician.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'workBays',
    option: 'technicians',
    read: (organizationId, page) => db.workBay.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'inspectionTemplates',
    option: 'inspections',
    read: (organizationId, page) =>
      db.inspectionTemplate.findMany({
        ...page,
        where: { organizationId },
        include: { sections: { include: { items: true } } },
      }),
  },
  {
    key: 'inspections',
    option: 'inspections',
    read: (organizationId, page) =>
      db.inspection.findMany({
        ...page,
        where: { organizationId },
        include: { items: true, attachments: true, statusReports: true, quoteRequests: true },
      }),
  },
  // Shelves first, then what sits on them: sets reference locations by id.
  {
    key: 'tireWarehouses',
    option: 'tireHotel',
    read: (organizationId, page) =>
      db.tireWarehouse.findMany({
        ...page,
        where: { organizationId },
        include: { locations: true },
      }),
  },
  {
    key: 'tireSets',
    option: 'tireHotel',
    read: (organizationId, page) =>
      db.tireSet.findMany({
        ...page,
        where: { organizationId },
        include: {
          // The condition photos hang off the reading, so they travel with it.
          measurements: { include: { images: true } },
          movements: true,
          treatments: true,
          attachments: true,
        },
      }),
  },
  // Archived statuses too: a finished job still names the status it carried.
  {
    key: 'workOrderStatuses',
    option: 'workshopConfig',
    read: (organizationId, page) =>
      db.workOrderStatus.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'conditionMarkTypes',
    option: 'workshopConfig',
    read: (organizationId, page) =>
      db.conditionMarkType.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'laborPresets',
    option: 'workshopConfig',
    read: (organizationId, page) =>
      db.laborPreset.findMany({
        ...page,
        where: { organizationId },
        include: { items: true, parts: true },
      }),
  },
  {
    key: 'webhooks',
    option: 'workshopConfig',
    read: (organizationId, page) => db.webhook.findMany({ ...page, where: { organizationId } }),
    map: (row, options) =>
      options.includeSecrets ? row : redactWebhookRow(row as Row & { secret: string }),
  },
  {
    key: 'reportSchedules',
    option: 'workshopConfig',
    read: (organizationId, page) =>
      db.reportSchedule.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'roles',
    option: 'workshopConfig',
    read: (organizationId, page) =>
      db.role.findMany({ ...page, where: { organizationId }, include: { permissions: true } }),
  },
  {
    key: 'auditLogs',
    option: 'auditLogs',
    read: (organizationId, page) => db.auditLog.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'smsMessages',
    option: 'smsMessages',
    read: (organizationId, page) => db.smsMessage.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'whatsappMessages',
    option: 'smsMessages',
    read: (organizationId, page) =>
      db.whatsappMessage.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'telegramMessages',
    option: 'smsMessages',
    read: (organizationId, page) =>
      db.telegramMessage.findMany({ ...page, where: { organizationId } }),
  },
  {
    // Attachments ride inside their message, which is what they belong to.
    key: 'emailMessages',
    option: 'smsMessages',
    read: (organizationId, page) =>
      db.emailMessage.findMany({
        ...page,
        where: { organizationId },
        include: { attachments: true },
      }),
  },
  {
    key: 'scheduledMessages',
    option: 'scheduledMessages',
    read: (organizationId, page) =>
      db.scheduledMessage.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'inspectionReminderCampaigns',
    option: 'scheduledMessages',
    read: (organizationId, page) =>
      db.inspectionReminderCampaign.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'inspectionReminderSends',
    option: 'scheduledMessages',
    read: (organizationId, page) =>
      db.inspectionReminderSend.findMany({ ...page, where: { organizationId } }),
  },
  {
    key: 'notifications',
    option: 'notifications',
    read: (organizationId, page) =>
      db.notification.findMany({ ...page, where: { organizationId } }),
  },
]

/** Every dataset key the writer can emit, in file order. */
export const BACKUP_DATASET_KEYS: readonly string[] = DATASETS.map((d) => d.key)

/** Writes one chunk, waiting for the stream to drain when it asks to. */
function write(out: NodeJS.WritableStream, chunk: string): Promise<void> {
  if (out.write(chunk)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      out.removeListener('drain', onDrain)
      out.removeListener('close', onClose)
      out.removeListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onDrain = () => done()
    const onClose = () => done(new Error('Backup output closed before the data was written'))
    const onError = (error: Error) => done(error)
    out.once('drain', onDrain)
    out.once('close', onClose)
    out.once('error', onError)
  })
}

export async function writeBackupData(
  organizationId: string,
  options: BuildDataOptions,
  out: NodeJS.WritableStream
): Promise<{ datasets: string[]; rows: number }> {
  if (!organizationId) throw new Error('writeBackupData needs an organisation')

  const datasets: string[] = []
  let rows = 0

  await write(out, `{"version":2,"exportedAt":${JSON.stringify(new Date().toISOString())},"data":{`)

  for (const dataset of DATASETS) {
    if (!options[dataset.option]) continue

    await write(out, `${datasets.length ? ',' : ''}${JSON.stringify(dataset.key)}:[`)
    datasets.push(dataset.key)

    const take = dataset.pageSize ?? PAGE_SIZE
    let cursor: string | undefined
    let first = true
    for (;;) {
      const page: Page = cursor
        ? { take, orderBy: { id: 'asc' }, cursor: { id: cursor }, skip: 1 }
        : { take, orderBy: { id: 'asc' } }
      const batch = await dataset.read(organizationId, page)
      if (batch.length === 0) break

      let chunk = ''
      for (const row of batch) {
        const value = dataset.map ? dataset.map(row, options) : row
        chunk += `${first ? '' : ','}${JSON.stringify(value)}`
        first = false
      }
      await write(out, chunk)
      rows += batch.length

      if (batch.length < take) break
      cursor = batch[batch.length - 1].id
    }

    await write(out, ']')
  }

  await write(out, '}}')
  return { datasets, rows }
}
