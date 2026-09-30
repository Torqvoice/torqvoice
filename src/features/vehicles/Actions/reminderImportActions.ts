'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import type { DateFormat } from '@/features/import/Lib/normalize'
import { ImportParseError, parseImportFile } from '@/features/import/Lib/parse'
import {
  MAX_REMINDER_IMPORT_BYTES,
  MAX_REMINDER_IMPORT_ROWS,
  mapReminderColumns,
  planReminderImport,
  type ReminderImportFileError,
  type ReminderImportPlan,
  type ReminderImportRow,
} from '../Lib/reminderImport'

const DATE_FORMATS: DateFormat[] = ['auto', 'DMY', 'MDY', 'YMD']

const permissions = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }]

export interface ReminderImportPreviewRow extends Omit<ReminderImportRow, 'dueAt'> {
  /** The file's own cells, kept for rows that are skipped so they can be downloaded. */
  raw: string[] | null
}

export type ReminderImportPreview =
  | { fileError: ReminderImportFileError; limit?: number }
  | {
      fileError: null
      fileName: string
      dateFormat: DateFormat
      columns: string[]
      ignoredColumns: string[]
      rows: ReminderImportPreviewRow[]
    }

export type ReminderImportResult =
  | { fileError: ReminderImportFileError; limit?: number }
  | { fileError: null; created: number; skipped: number }

type Loaded =
  | { fileError: ReminderImportFileError; limit?: number }
  | {
      fileError: null
      fileName: string
      columns: string[]
      rows: string[][]
      plan: ReminderImportPlan
    }

/**
 * Read the upload and plan every row against this workshop's vehicles,
 * customers and open reminders. The preview and the import both come here,
 * so what is imported is exactly what the preview showed for the same file.
 */
async function loadPlan(formData: FormData, organizationId: string): Promise<Loaded> {
  if (isDemoMode) return { fileError: 'demo' }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { fileError: 'noFile' }
  if (file.size > MAX_REMINDER_IMPORT_BYTES) return { fileError: 'tooLarge' }
  const requested = String(formData.get('dateFormat') ?? 'auto') as DateFormat
  const dateFormat = DATE_FORMATS.includes(requested) ? requested : 'auto'

  let sheet: Awaited<ReturnType<typeof parseImportFile>>
  try {
    sheet = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name)
  } catch (err) {
    if (err instanceof ImportParseError) {
      if (err.code === 'too_many_rows') {
        return { fileError: 'tooManyRows', limit: MAX_REMINDER_IMPORT_ROWS }
      }
      if (err.code === 'legacy_xls') return { fileError: 'legacyXls' }
      if (err.code === 'empty') return { fileError: 'empty' }
      if (err.code === 'unsupported_format') return { fileError: 'unsupported' }
      return { fileError: 'unreadable' }
    }
    throw err
  }
  // A contact list is not a reminder list.
  if (sheet.format === 'vcard') return { fileError: 'unsupported' }
  if (sheet.rows.length > MAX_REMINDER_IMPORT_ROWS) {
    return { fileError: 'tooManyRows', limit: MAX_REMINDER_IMPORT_ROWS }
  }
  const { columns } = mapReminderColumns(sheet.columns)
  if (!columns.title) return { fileError: 'noTitleColumn' }

  const [vehicles, customers, openReminders, timeZone] = await Promise.all([
    columns.licensePlate || columns.vin
      ? db.vehicle.findMany({
          where: { organizationId, isArchived: false },
          select: {
            id: true,
            licensePlate: true,
            vin: true,
            customerId: true,
            year: true,
            make: true,
            model: true,
          },
        })
      : [],
    columns.customer
      ? db.customer.findMany({
          where: { organizationId },
          select: { id: true, name: true, email: true, customerNumber: true },
        })
      : [],
    db.reminder.findMany({
      where: { organizationId, isCompleted: false },
      select: { vehicleId: true, customerId: true, title: true, dueDate: true, dueMileage: true },
    }),
    workshopTimeZone(organizationId),
  ])

  const plan = planReminderImport(
    sheet.columns,
    sheet.rows,
    { vehicles, customers, openReminders, timeZone },
    dateFormat
  )
  return { fileError: null, fileName: file.name, columns: sheet.columns, rows: sheet.rows, plan }
}

export async function previewReminderImport(formData: FormData) {
  return withAuth(
    async ({ organizationId }): Promise<ReminderImportPreview> => {
      const loaded = await loadPlan(formData, organizationId)
      if (loaded.fileError) return loaded
      return {
        fileError: null,
        fileName: loaded.fileName,
        dateFormat: loaded.plan.dateFormat,
        columns: loaded.columns,
        ignoredColumns: loaded.plan.ignoredColumns,
        rows: loaded.plan.rows.map(({ dueAt: _dueAt, ...row }, i) => ({
          ...row,
          raw: row.status === 'ready' ? null : loaded.rows[i],
        })),
      }
    },
    { requiredPermissions: permissions }
  )
}

export async function importReminders(formData: FormData) {
  return withAuth(
    async ({ organizationId }): Promise<ReminderImportResult & { fileName?: string }> => {
      const loaded = await loadPlan(formData, organizationId)
      if (loaded.fileError) return loaded
      const ready = loaded.plan.rows.filter((r) => r.status === 'ready')
      if (ready.length) {
        await db.reminder.createMany({
          data: ready.map((r) => {
            const target = r.target
            return {
              organizationId,
              title: r.title as string,
              description: r.description,
              dueDate: r.dueAt,
              hasDueTime: Boolean(r.dueAt && r.dueTime),
              dueMileage: r.dueMileage,
              notifyInApp: true,
              notifyEmail: r.notifyEmail,
              // As in createReminder, a vehicle reminder carries the vehicle's customer.
              vehicleId: target?.kind === 'vehicle' ? target.id : null,
              customerId:
                target?.kind === 'vehicle'
                  ? target.customerId
                  : target?.kind === 'customer'
                    ? target.id
                    : null,
            }
          }),
        })
        revalidatePath('/')
        revalidatePath('/reminders')
        revalidatePath('/vehicles', 'layout')
      }
      return {
        fileError: null,
        fileName: loaded.fileName,
        created: ready.length,
        skipped: loaded.plan.rows.length - ready.length,
      }
    },
    {
      requiredPermissions: permissions,
      audit: ({ result }) =>
        result.fileError === null && result.created > 0
          ? {
              action: 'reminder.import',
              entity: 'Reminder',
              details: {
                key: 'reminder_import',
                params: { count: result.created, fileName: result.fileName ?? '' },
              },
              metadata: { created: result.created, skipped: result.skipped },
            }
          : null,
    }
  )
}
