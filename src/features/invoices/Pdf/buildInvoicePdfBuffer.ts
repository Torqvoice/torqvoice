/**
 * Shared invoice PDF builder.
 *
 * Renders an invoice PDF for a given service record id. Used by the public
 * share-token PDF route and the customer-portal session PDF route. The
 * caller is responsible for verifying that the requester is allowed to see
 * the record; this helper trusts the caller and only checks that it exists.
 *
 * What the sheet says comes from assembleInvoicePrint, which reads an issued
 * invoice from its snapshots and a draft from live rows. What is added here
 * is not part of the document: the reader's translations, the portal link,
 * the Telegram code and the Torqvoice mark.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { InvoicePDF } from '@/features/vehicles/Components/InvoicePDF'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { assembleInvoicePrint, invoiceNumberOf } from '../Lib/assembleInvoicePrint'
import { telegramQrForPrint } from '@/features/invoices/Lib/telegramQr'
import { getAppBaseUrl } from '@/lib/app-url'

export async function buildInvoicePdfBuffer(
  serviceRecordId: string,
  acceptLanguageHeader: string | null
): Promise<{ buffer: Uint8Array; filename: string } | null> {
  const assembly = await assembleInvoicePrint(serviceRecordId)
  if (!assembly) return null
  const { record, organizationId: orgId, org, settingsMap, layoutConfig } = assembly

  const locale = await resolveCustomerLocale(orgId, acceptLanguageHeader)
  const labels = await loadPrintLabels(locale, assembly.labelSettings)

  // Check if Torqvoice branding should be shown
  const features = await getFeatures(orgId)
  let torqvoiceLogoDataUri: string | undefined
  if (!features.brandingRemoved) {
    torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri()
  }

  const appUrl = getAppBaseUrl()
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const buffer = await renderToBuffer(element)

  return {
    buffer,
    filename: `${invoiceNumberOf(record)}.pdf`,
  }
}
