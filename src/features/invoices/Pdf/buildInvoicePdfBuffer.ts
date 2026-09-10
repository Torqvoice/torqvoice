/**
 * The one place the invoice sheet becomes a PDF.
 *
 * Four things hand this document to somebody: the preview dialog, the
 * workshop's download, the customer's share link (with the portal behind it),
 * and the copy attached to an email. They have to be the same document. They
 * were not — the emailed copy was rendered from its own call, and so went out
 * without the portal link, the Telegram code and the Torqvoice mark that every
 * other copy carries — which is why building the element lives here and
 * nowhere else.
 *
 * What the sheet says comes from assembleInvoicePrint, which reads an issued
 * invoice from its snapshots and a draft from live rows. What is added here is
 * not part of the document: the reader's translations, the portal link, the
 * Telegram code and the mark.
 *
 * The workshop's own copy carries the job's attachments as well, which the
 * customer's copy does not: photographs and diagnostic printouts belong to the
 * shop's file, and the share link has its own gallery for what the customer
 * should see.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { InvoicePDF } from '@/features/vehicles/Components/InvoicePDF'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import {
  assembleInvoicePrint,
  type InvoicePrintAssembly,
  invoiceNumberOf,
} from '../Lib/assembleInvoicePrint'
import { telegramQrForPrint } from '@/features/invoices/Lib/telegramQr'
import { getAppBaseUrl } from '@/lib/app-url'

/** The job's own files, printed into the workshop's copy only. */
export interface InvoicePdfAttachments {
  imageAttachments?: { fileName: string; dataUri: string; description?: string }[]
  otherAttachments?: { fileName: string; fileType: string }[]
  pdfAttachmentNames?: string[]
}

/**
 * Renders one invoice from an assembly the caller already has, in the
 * caller's language. Every copy of the document goes through here.
 */
export async function renderInvoicePdf(
  assembly: InvoicePrintAssembly,
  locale: string,
  attachments: InvoicePdfAttachments = {}
): Promise<Uint8Array> {
  const { organizationId: orgId, org, settingsMap, layoutConfig } = assembly

  const labels = await loadPrintLabels(locale, assembly.labelSettings)

  // The mark comes off for the plans that paid to remove it.
  const features = await getFeatures(orgId)
  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled
    ? `${getAppBaseUrl()}/portal/${org?.portalSlug || orgId}`
    : undefined

  const telegramQr = await telegramQrForPrint(orgId, layoutConfig)

  const element = React.createElement(InvoicePDF, {
    data: assembly.data,
    workshop: assembly.workshop,
    invoiceSettings: assembly.invoiceSettings,
    paymentSummary: assembly.paymentSummary,
    logoDataUri: assembly.logoDataUri,
    template: assembly.template,
    torqvoiceLogoDataUri,
    portalUrl,
    telegramQrDataUri: telegramQr?.dataUri,
    telegramLabel: labels?.telegramConnect || 'Chat with us on Telegram',
    labels,
    ...attachments,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  return renderToBuffer(element)
}

/**
 * The customer's copy, for a record id: used by the public share-token route
 * and the customer-portal route. The caller is responsible for deciding that
 * the requester may see it; this only checks that it exists.
 */
export async function buildInvoicePdfBuffer(
  serviceRecordId: string,
  acceptLanguageHeader: string | null
): Promise<{ buffer: Uint8Array; filename: string } | null> {
  const assembly = await assembleInvoicePrint(serviceRecordId)
  if (!assembly) return null

  const locale = await resolveCustomerLocale(assembly.organizationId, acceptLanguageHeader)
  const buffer = await renderInvoicePdf(assembly, locale)

  return { buffer, filename: `${invoiceNumberOf(assembly.record)}.pdf` }
}
