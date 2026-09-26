import 'server-only'

import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { WorkOrderPDF } from '@/features/vehicles/Components/invoice-pdf/WorkOrderPDF'
import { assembleWorkOrderPrint, workOrderNumberOf } from '../Lib/assembleWorkOrderPrint'
import { loadConditionMapLabels } from '@/features/condition-map/Lib/labels'

/** The stage names the sheet prints when the workshop has no name of its own for the status. */
const STAGE_LABEL_KEYS: Record<string, string> = {
  pending: 'statusPending',
  'in-progress': 'statusInProgress',
  'waiting-parts': 'statusWaitingParts',
  completed: 'statusCompleted',
}

/**
 * The one place a work order becomes a PDF, for the preview and the
 * download alike. The workshop reads it in its own language: it is the
 * workshop's sheet, signed at its counter.
 */
export async function buildWorkOrderPdfBuffer(
  serviceRecordId: string,
  locale: string
): Promise<{ buffer: Uint8Array; filename: string } | null> {
  const assembly = await assembleWorkOrderPrint(serviceRecordId)
  if (!assembly) return null

  const [labels, conditionMapLabels] = await Promise.all([
    loadPrintLabels(locale, assembly.labelSettings, 'work_order'),
    loadConditionMapLabels(locale),
  ])
  const features = await getFeatures(assembly.organizationId)
  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  const { job } = assembly
  const stageKey = STAGE_LABEL_KEYS[job.status]
  const statusLabel =
    job.customStatusName || (stageKey ? labels[stageKey] || job.status : job.status)

  const element = React.createElement(WorkOrderPDF, {
    data: assembly.data,
    job: { ...job, statusLabel, conditionMapLabels },
    workshop: assembly.workshop,
    invoiceSettings: assembly.invoiceSettings,
    logoDataUri: assembly.logoDataUri,
    signer: assembly.signer,
    template: assembly.template,
    torqvoiceLogoDataUri,
    labels,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const buffer = await renderToBuffer(element)
  return { buffer, filename: `${workOrderNumberOf(assembly.record)}-work-order.pdf` }
}
