import 'server-only'

import { readFile } from 'fs/promises'
import React from 'react'
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { templateConfigFromSource } from '@/features/invoice-designer/Lib/designSource'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { certificateSignatureDataUri } from '@/features/signatures/Lib/memberSignature.server'
import { CertificatePDF } from '../Components/CertificatePDF'
import { appendCertificateDocuments, certificateDocuments } from '../Lib/certificateDocuments'
import { loadInspectionOverviewPhotos, loadInspectionPhotos } from '../Lib/inspectionPhotos'
import { certificateDesignSource, loadCertificateLabels } from './certificateDesign'
import { loadVehicleConditionMarks } from '@/features/condition-map/Actions/conditionMarkActions'
import { loadConditionMapLabels } from '@/features/condition-map/Lib/labels'

export { certificateDesignSource, liveCertificateDesign } from './certificateDesign'

/**
 * The one place a designed certificate becomes a PDF, for the workshop's
 * download and the customer's link alike.
 *
 * Returns nothing when this inspection has no design to print from: no
 * snapshot frozen on it and no certificate layout saved in the designer. The
 * routes then print the built-in sheet, which is what every certificate was
 * before designs existed, so a workshop that never opens the designer sees
 * no change.
 */

async function logoDataUriFor(settingsMap: Record<string, string>): Promise<string | undefined> {
  const logoPath = documentLogoPath(settingsMap, 'certificate')
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

export async function buildCertificatePdfBuffer({
  inspectionId,
  organizationId,
  locale,
  audience,
  portalUrl,
}: {
  inspectionId: string
  organizationId: string
  locale: string
  /** The customer's copy carries only the name needed to say whose car it is. */
  audience: 'workshop' | 'customer'
  portalUrl?: string
}): Promise<{ body: ArrayBuffer; fileName: string } | null> {
  const [inspection, settings, org] = await Promise.all([
    db.inspection.findFirst({
      where: { id: inspectionId, organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            bodyType: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            licensePlate: true,
            mileage: true,
            customer: {
              select:
                audience === 'workshop'
                  ? { name: true, email: true, phone: true, address: true, company: true }
                  : { name: true },
            },
          },
        },
        template: { select: { name: true, severityScale: true, country: true } },
        technician: { select: { name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        attachments: { where: { includeInReport: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    db.appSetting.findMany({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])
  if (!inspection) return null

  const settingsMap: Record<string, string> = {}
  for (const row of settings) settingsMap[row.key] = row.value

  const source = await certificateDesignSource(organizationId, inspection, settingsMap)
  if (!source) return null

  const labels = await loadCertificateLabels(locale, settingsMap)

  const hasMap = inspection.items.some((item) => item.inputType === 'condition_map')
  const [logoDataUri, features, signatureDataUri, conditionMarks, conditionMapLabels] =
    await Promise.all([
      logoDataUriFor(settingsMap),
      getFeatures(organizationId),
      certificateSignatureDataUri(organizationId, inspection),
      hasMap ? loadVehicleConditionMarks(organizationId, inspection.vehicle.id) : [],
      hasMap ? loadConditionMapLabels(locale) : undefined,
    ])

  // Photos are an enhancement; the certificate is the document.
  let itemPhotos: Awaited<ReturnType<typeof loadInspectionPhotos>>['photos'] = {}
  let overviewPhotos: Awaited<ReturnType<typeof loadInspectionOverviewPhotos>>['photos'] = []
  try {
    itemPhotos = (await loadInspectionPhotos(inspection.items)).photos
    overviewPhotos = (await loadInspectionOverviewPhotos(inspection.attachments)).photos
  } catch (error) {
    console.error('[Certificate PDF] Photo embedding failed, rendering without photos:', error)
  }
  const documents = certificateDocuments(inspection.attachments)

  const element = React.createElement(CertificatePDF, {
    data: inspection,
    workshop: {
      name: org?.name || '',
      address: settingsMap['workshop.address'] || '',
      phone: settingsMap['workshop.phone'] || '',
      email: settingsMap['workshop.email'] || '',
      slogan: settingsMap['workshop.slogan'] || undefined,
    },
    labels,
    logoDataUri,
    signatureDataUri,
    torqvoiceLogoDataUri: features.brandingRemoved ? undefined : await getTorqvoiceLogoDataUri(),
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
    template: templateConfigFromSource(source),
    layoutConfig: templateConfigFromSource(source).layoutConfig,
    portalUrl,
    itemPhotos,
    overviewPhotos,
    attachedDocuments: documents.map((document) => document.fileName),
    conditionMarks,
    bodyType: inspection.vehicle.bodyType,
    conditionMapLabels,
  }) as unknown as React.ReactElement<DocumentProps>
  const rendered = await renderToBuffer(element)
  const body = await appendCertificateDocuments(Buffer.from(rendered), documents)
  const vehicleName = `${inspection.vehicle.year}-${inspection.vehicle.make}-${inspection.vehicle.model}`
  return { body, fileName: `Inspection-${vehicleName}.pdf` }
}
