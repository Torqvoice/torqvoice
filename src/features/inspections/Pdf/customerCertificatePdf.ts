import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { readFile } from 'fs/promises'
import { db } from '@/lib/db'
import { InspectionPDF } from '@/features/inspections/Components/InspectionPDF'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import {
  loadInspectionOverviewPhotos,
  loadInspectionPhotos,
} from '@/features/inspections/Lib/inspectionPhotos'
import {
  appendCertificateDocuments,
  certificateDocuments,
} from '@/features/inspections/Lib/certificateDocuments'
import { inspectionPrintLabels } from '@/features/inspections/Lib/inspectionLabels'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { getAppBaseUrl } from '@/lib/app-url'
import { gateTypeKey, typeKeyEnabledIn } from '@/features/vehicles/Lib/typeKeySetting'
import { linkedCertificateInspectionId } from '@/features/inspections/Lib/linkedCertificate.server'
import { buildCertificatePdfBuffer } from './buildCertificatePdfBuffer'

/**
 * The inspection certificate as a customer receives it, whichever way it
 * reaches them: its own share link, or attached to the invoice or the quote
 * the inspection belongs to. The workshop's designed certificate when it has
 * one, the built-in sheet otherwise, carrying only the name needed to say
 * whose car was tested. The caller decides that the requester may see it.
 */
export async function buildCustomerCertificatePdf({
  inspectionId,
  organizationId: orgId,
  locale,
}: {
  inspectionId: string
  organizationId: string
  locale: string
}): Promise<{ body: ArrayBuffer; fileName: string } | null> {
  const [portalSetting, portalOrg] = await Promise.all([
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'portal.enabled' } },
      select: { value: true },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { portalSlug: true } }),
  ])
  const designed = await buildCertificatePdfBuffer({
    inspectionId,
    organizationId: orgId,
    locale,
    audience: 'customer',
    portalUrl:
      portalSetting?.value === 'true'
        ? `${getAppBaseUrl()}/portal/${portalOrg?.portalSlug || orgId}`
        : undefined,
  })
  if (designed) return designed

  let pdfMessages: Record<string, Record<string, string>>
  try {
    pdfMessages = (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    pdfMessages = (await import(`../../../../messages/en/pdf.json`)).default
  }

  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, organizationId: orgId },
    include: {
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          vin: true,
          hsn: true,
          tsn: true,
          licensePlate: true,
          mileage: true,
          // Data minimisation (GDPR Art. 5(1)(c)): this certificate goes to
          // the customer, so it carries only the name needed to identify
          // whose vehicle was tested.
          customer: { select: { name: true } },
        },
      },
      template: { select: { name: true, severityScale: true, country: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      // What the workshop chose to show of the files on the inspection itself.
      attachments: { where: { includeInReport: true }, orderBy: { createdAt: 'asc' } },
    },
  })

  if (!inspection) return null

  const [settings, org] = await Promise.all([
    db.appSetting.findMany({ where: { organizationId: orgId } }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true, portalSlug: true },
    }),
  ])

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  // Marine workshops get the vessel wording.
  const labels = inspectionPrintLabels(pdfMessages, settingsMap)

  let logoDataUri: string | undefined
  const logoPath = settingsMap['workshop.logo']
  if (logoPath) {
    try {
      const fullPath = resolveUploadPath(logoPath)
      const logoBuffer = await readFile(fullPath)
      const ext = logoPath.split('.').pop()?.toLowerCase() || 'png'
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      }
      const mime = mimeMap[ext] || 'image/png'
      logoDataUri = `data:${mime};base64,${logoBuffer.toString('base64')}`
    } catch {
      // Skip
    }
  }

  const features = await getFeatures(orgId)
  let torqvoiceLogoDataUri: string | undefined
  if (!features.brandingRemoved) {
    torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri()
  }

  const template = {
    primaryColor: settingsMap['invoice.primaryColor'] || '#d97706',
    fontFamily: settingsMap['invoice.fontFamily'] || 'Helvetica',
    showLogo: settingsMap['invoice.showLogo'] !== 'false',
    showCompanyName: settingsMap['invoice.showCompanyName'] !== 'false',
    headerStyle: settingsMap['invoice.headerStyle'] || 'standard',
  }

  const appUrl = getAppBaseUrl()
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  // Photos are an enhancement; the certificate is the document. See the
  // protected route for why this is not allowed to fail the download.
  let photos: Awaited<ReturnType<typeof loadInspectionPhotos>>['photos'] = {}
  let photosOmitted = 0
  try {
    ;({ photos, omitted: photosOmitted } = await loadInspectionPhotos(inspection.items))
  } catch (error) {
    console.error('[Customer certificate] Photo embedding failed, rendering without photos:', error)
  }

  let overviewPhotos: Awaited<ReturnType<typeof loadInspectionOverviewPhotos>>['photos'] = []
  try {
    const overview = await loadInspectionOverviewPhotos(inspection.attachments)
    overviewPhotos = overview.photos
    photosOmitted += overview.omitted
  } catch (error) {
    console.error(
      '[Customer certificate] Overview photo embedding failed, rendering without them:',
      error
    )
  }
  const documents = certificateDocuments(inspection.attachments)

  const element = React.createElement(InspectionPDF, {
    data: {
      ...inspection,
      vehicle: gateTypeKey(inspection.vehicle, typeKeyEnabledIn(settingsMap)),
    },
    workshop: {
      name: org?.name || '',
      address: settingsMap['workshop.address'] || '',
      phone: settingsMap['workshop.phone'] || '',
      email: settingsMap['workshop.email'] || '',
    },
    logoDataUri,
    torqvoiceLogoDataUri,
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
    template,
    portalUrl,
    labels,
    photos,
    photosOmitted,
    overviewPhotos,
    attachedDocuments: documents.map((document) => document.fileName),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const buffer = await renderToBuffer(element)
  // The signed forms follow the certificate as pages of their own.
  const body = await appendCertificateDocuments(buffer, documents)

  const vehicleName = `${inspection.vehicle.year}-${inspection.vehicle.make}-${inspection.vehicle.model}`
  return { body, fileName: `Inspection-${vehicleName}.pdf` }
}

/**
 * The certificate of the inspection a job or a quote is linked to, for the
 * customer, or null when there is none to give.
 */
export async function linkedCertificatePdf(
  organizationId: string,
  inspectionId: string | null | undefined,
  locale: string
): Promise<{ body: ArrayBuffer; fileName: string } | null> {
  const id = await linkedCertificateInspectionId(organizationId, inspectionId)
  if (!id) return null
  return buildCustomerCertificatePdf({ inspectionId: id, organizationId, locale })
}

/**
 * The linked inspection's certificate as a mail attachment, beside the
 * invoice or the quote it belongs to; nothing when there is none to give.
 */
export async function linkedCertificateAttachment(
  organizationId: string,
  inspectionId: string | null | undefined,
  locale: string
): Promise<{ filename: string; content: Buffer } | null> {
  const certificate = await linkedCertificatePdf(organizationId, inspectionId, locale)
  if (!certificate) return null
  return { filename: certificate.fileName, content: Buffer.from(certificate.body) }
}

/** A certificate as a download: the bytes, named, and kept out of search engines. */
export function certificateDownload(certificate: {
  body: ArrayBuffer
  fileName: string
}): Response {
  return new Response(certificate.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${certificate.fileName}"`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
