/**
 * The one place a quote becomes a PDF.
 *
 * Three things hand this document to somebody: the workshop's download (and
 * the preview behind it), the public link a customer opens, and the copy
 * attached to an email. They have to be the same document, and they were not.
 * The two routes each assembled two hundred near-identical lines, and the
 * email built its own thin version: no print labels, so the customer's copy
 * said "Labor" where the others said "Labor & Services" and "Unit price" where
 * they said "Unit Price", and no Torqvoice mark at all.
 *
 * What the sheet says is the quote's own rows; what is added here is not part
 * of it: the reader's translations, the workshop's palette and layout, its
 * logo, the mark, and the quote's own files — printed as a gallery and
 * appended whole where they are PDFs.
 */

import { readFile } from 'node:fs/promises'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { PDFDocument } from 'pdf-lib'
import React from 'react'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { withOrgNumberLabel } from '@/features/invoice-designer/Lib/labelOverrides'
import { QuotePDF } from '@/features/quotes/Components/QuotePDF'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { resolveUploadPath } from '@/lib/resolve-upload-path'

/** What the quote number is when the workshop's numbering never gave it one. */
export function quoteNumberOf(quote: { id: string; quoteNumber?: string | null }): string {
  return quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`
}

const QUOTE_INCLUDE = {
  partItems: true,
  laborItems: true,
  attachments: true,
  customer: {
    select: { name: true, email: true, phone: true, address: true, company: true, taxId: true },
  },
  vehicle: {
    select: { make: true, model: true, year: true, vin: true, licensePlate: true },
  },
} as const

/**
 * The words on the sheet, in the reader's language.
 *
 * The quote shares its builder with the invoice, and so its column heads and
 * panel titles: quote wording is layered over the invoice's so every shared
 * label stays translated instead of falling back to English. The workshop's
 * own overrides go on top — what it calls its tax and its registration
 * number, and the marine vocabulary for a yard that services boats.
 */
async function printLabels(locale: string, settingsMap: Record<string, string>) {
  let messages: Record<string, Record<string, string>>
  try {
    messages = (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    messages = (await import(`../../../../messages/en/pdf.json`)).default
  }

  const labels: Record<string, string> = {
    ...messages.invoice,
    ...messages.quote,
    ...messages.common,
  }

  if ((settingsMap['workshop.serviceType'] || 'automotive') === 'marine') {
    if (messages.quote.vinMarine) labels.vin = messages.quote.vinMarine
    if (messages.quote.plateMarine) labels.plate = messages.quote.plateMarine
    if (messages.quote.vehicleMarine) labels.vehicle = messages.quote.vehicleMarine
  }

  const customTaxLabel = settingsMap['workshop.taxLabel']?.trim()
  if (customTaxLabel) labels.tax = `${customTaxLabel} ({rate}%)`

  Object.assign(labels, withOrgNumberLabel(labels, settingsMap['workshop.orgNumberLabel']))
  return labels
}

/** The workshop's own document logo, as bytes the renderer can draw. */
async function logoDataUriFor(settingsMap: Record<string, string>): Promise<string | undefined> {
  const logoPath = documentLogoPath(settingsMap, 'quote')
  if (!logoPath) return undefined
  try {
    const bytes = await readFile(resolveUploadPath(logoPath))
    const extension = logoPath.split('.').pop()?.toLowerCase() || 'png'
    const mime =
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      }[extension] || 'image/png'
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

/** The palette and page furniture, the quote's own where it has one and the invoice's otherwise. */
function templateFor(settingsMap: Record<string, string>) {
  const of = (key: string) => settingsMap[`quote.${key}`] || settingsMap[`invoice.${key}`]
  return {
    primaryColor: of('primaryColor') || '#d97706',
    backgroundColor: of('backgroundColor') || undefined,
    textColor: of('textColor') || undefined,
    companyTextColor: of('companyTextColor') || undefined,
    frameBorderColor: of('frameBorderColor') || undefined,
    frameShadow: settingsMap['quote.frameShadow'] ?? settingsMap['invoice.frameShadow'],
    frameRadius:
      Number(settingsMap['quote.frameRadius'] ?? settingsMap['invoice.frameRadius']) || 0,
    frameSide: ((settingsMap['quote.frameSide'] ?? settingsMap['invoice.frameSide']) === 'right'
      ? 'right'
      : 'left') as 'left' | 'right',
    fontFamily: of('fontFamily') || 'Helvetica',
    showLogo: settingsMap['invoice.showLogo'] !== 'false',
    showCompanyName: settingsMap['invoice.showCompanyName'] !== 'false',
    headerStyle: of('headerStyle') || 'standard',
    logoSize: Number(settingsMap['quote.logoSize']) || 100,
  }
}

/**
 * Renders one quote, whoever is asking for it. The caller decides that the
 * requester may see it; this only checks that it exists.
 */
export async function buildQuotePdfBuffer(
  quoteId: string,
  organizationId: string,
  locale: string
): Promise<{ buffer: Uint8Array; filename: string } | null> {
  const [quote, settings, org] = await Promise.all([
    db.quote.findFirst({ where: { id: quoteId, organizationId }, include: QUOTE_INCLUDE }),
    db.appSetting.findMany({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])
  if (!quote) return null

  const settingsMap: Record<string, string> = {}
  for (const row of settings) settingsMap[row.key] = row.value

  // The quote's own files: photographs printed as a gallery, PDFs appended
  // whole, and anything else listed by name.
  const imageAttachments: { fileName: string; dataUri: string; description?: string }[] = []
  const otherAttachments: { fileName: string; fileType: string }[] = []
  const pdfAttachments: { fileName: string; buffer: Buffer }[] = []

  const seen = new Set<string>()
  const attachments = quote.attachments
    .filter((att) => att.includeInInvoice !== false)
    .filter((att) => (seen.has(att.fileName) ? false : (seen.add(att.fileName), true)))

  for (const att of attachments) {
    try {
      const bytes = await readFile(resolveUploadPath(att.fileUrl))
      if (att.fileType.startsWith('image/')) {
        imageAttachments.push({
          fileName: att.fileName,
          dataUri: `data:${att.fileType};base64,${bytes.toString('base64')}`,
          description: att.description || undefined,
        })
      } else if (att.fileType === 'application/pdf') {
        pdfAttachments.push({ fileName: att.fileName, buffer: bytes })
      } else {
        otherAttachments.push({ fileName: att.fileName, fileType: att.fileType })
      }
    } catch {
      otherAttachments.push({ fileName: att.fileName, fileType: att.fileType })
    }
  }

  const [labels, logoDataUri, features, customFields, layoutRow] = await Promise.all([
    printLabels(locale, settingsMap),
    logoDataUriFor(settingsMap),
    getFeatures(organizationId),
    getCustomFieldsForPrint(organizationId, quote.id, 'quote'),
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'quote.layoutConfig' } },
    }),
  ])

  const element = React.createElement(QuotePDF, {
    lineItemsInclTax: settingsMap['invoice.lineItemsInclTax'] === 'true',
    data: quote,
    workshop: {
      name: org?.name || '',
      address: settingsMap['workshop.address'] || '',
      phone: settingsMap['workshop.phone'] || '',
      email: settingsMap['workshop.email'] || '',
      slogan: settingsMap['workshop.slogan'] || undefined,
    },
    currencyCode: settingsMap['workshop.currencyCode'] || 'USD',
    currencyFormat: (settingsMap['workshop.currencyFormat'] === 'code' ? 'code' : 'symbol') as
      | 'symbol'
      | 'code',
    logoDataUri,
    // The mark comes off for the plans that paid to remove it.
    torqvoiceLogoDataUri: features.brandingRemoved ? undefined : await getTorqvoiceLogoDataUri(),
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
    template: templateFor(settingsMap),
    imageAttachments,
    otherAttachments,
    pdfAttachmentNames: pdfAttachments.map((att) => att.fileName),
    customFields,
    labels,
    layoutConfig: mergeWithDefaults(layoutRow?.value ? JSON.parse(layoutRow.value) : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  const rendered = await renderToBuffer(element)
  return {
    buffer: pdfAttachments.length > 0 ? await appendPdfs(rendered, pdfAttachments) : rendered,
    filename: `${quoteNumberOf(quote)}.pdf`,
  }
}

/** The quote, with each attached PDF's pages after it. Unreadable ones are skipped. */
async function appendPdfs(
  rendered: Uint8Array,
  attached: { fileName: string; buffer: Buffer }[]
): Promise<Uint8Array> {
  const merged = await PDFDocument.load(rendered)
  for (const att of attached) {
    try {
      const document = await PDFDocument.load(att.buffer)
      const pages = await merged.copyPages(document, document.getPageIndices())
      for (const page of pages) merged.addPage(page)
    } catch {
      // A file that will not open is left out rather than taking the quote with it.
    }
  }
  return merged.save()
}
