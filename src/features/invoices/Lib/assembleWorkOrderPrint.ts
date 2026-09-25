import 'server-only'

import { db } from '@/lib/db'
import { getAppBaseUrl } from '@/lib/app-url'
import { generateQrDataUri } from '@/lib/qr'
import {
  designSourceFromSettings,
  templateConfigFromSource,
} from '@/features/invoice-designer/Lib/designSource'
import { workOrderQrWanted } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import type { WorkOrderJob } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { assembleInvoicePrint, designLook, type InvoicePrintAssembly } from './assembleInvoicePrint'

/**
 * A job as the work order sheet prints it.
 *
 * The invoice's assembler already reads everything the two sheets share, so
 * this asks it for the live rows (a work order is never printed from a
 * snapshot: it is the job as it stands) and adds what only the work order
 * says: the status in words, the bay, the promise, the customer's concerns,
 * the code that opens the job on a phone, and the work order's own design.
 */
export interface WorkOrderPrintAssembly extends InvoicePrintAssembly {
  job: Omit<WorkOrderJob, 'statusLabel'> & {
    /** The workshop's own name for the status, or null for a stage the reader's language names. */
    customStatusName: string | null
    status: string
  }
}

export async function assembleWorkOrderPrint(
  recordId: string
): Promise<WorkOrderPrintAssembly | null> {
  const base = await assembleInvoicePrint(recordId, { mode: 'live' })
  if (!base) return null
  const { record, organizationId, settingsMap } = base

  const [job, concerns] = await Promise.all([
    db.serviceRecord.findUnique({
      where: { id: record.id },
      select: {
        promisedAt: true,
        status: true,
        customStatus: { select: { name: true } },
        workBay: { select: { name: true } },
      },
    }),
    db.serviceConcern.findMany({
      where: { serviceRecordId: record.id },
      select: { description: true, correction: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  // The work order's own design, never the invoice's: what a customer signs
  // is not what they are billed with. Its default is the work order's, so a
  // workshop that never opened the designer still gets the right sheet.
  const source = designSourceFromSettings(settingsMap, 'work_order')
  source.layout = { ...source.layout, documentType: 'work_order' }
  // The work order's own logo when it has one, the company's otherwise.
  const look = await designLook(settingsMap, source)
  const template = templateConfigFromSource(look.designSource)
  const layoutConfig = mergeWithDefaults({ ...source.layout, documentType: 'work_order' })

  // The code that opens this job on a phone: the job's own page, which the
  // web app shows on a phone as it does on the desk.
  const qrDataUri = workOrderQrWanted(layoutConfig)
    ? await generateQrDataUri(
        record.vehicleId
          ? `${getAppBaseUrl()}/vehicles/${record.vehicleId}/service/${record.id}`
          : `${getAppBaseUrl()}/sales/${record.id}`,
        240
      )
    : undefined

  return {
    ...base,
    template,
    layoutConfig,
    logoDataUri: look.logoDataUri,
    designSource: look.designSource,
    job: {
      orderNumber: workOrderNumberOf(record),
      status: job?.status ?? record.status,
      customStatusName: job?.customStatus?.name ?? null,
      workBay: job?.workBay?.name ?? null,
      promisedAt: job?.promisedAt ?? null,
      concerns: concerns.filter((concern) => concern.description.trim()),
      qrDataUri,
      printedAt: new Date(),
    },
  }
}

/** The job's number as the strip and the file spell it. */
export function workOrderNumberOf(record: { invoiceNumber: string | null; id: string }): string {
  return record.invoiceNumber || `WO-${record.id.slice(-8).toUpperCase()}`
}
