import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { cookies } from 'next/headers'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { InspectionPDF } from '@/features/inspections/Components/InspectionPDF'
import React from 'react'
import { readFile } from 'fs/promises'
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
import { buildCertificatePdfBuffer } from '@/features/inspections/Pdf/buildCertificatePdfBuffer'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load locale-based PDF translations
    const cookieStore = await cookies()
    const locale = cookieStore.get('locale')?.value || 'en'
    let pdfMessages: Record<string, Record<string, string>>
    try {
      pdfMessages = (await import(`../../../../../../../messages/${locale}/pdf.json`)).default
    } catch {
      pdfMessages = (await import(`../../../../../../../messages/en/pdf.json`)).default
    }

    const { id } = await params

    // A workshop that has designed its certificate prints from the design
    // (frozen onto the inspection when it was completed); the rest print the
    // built-in sheet below, unchanged.
    const designed = await buildCertificatePdfBuffer({
      inspectionId: id,
      organizationId: ctx.organizationId,
      locale,
      audience: 'workshop',
    })
    if (designed) {
      return new NextResponse(designed.body, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${designed.fileName}"`,
        },
      })
    }

    const [inspection, settings, org] = await Promise.all([
      db.inspection.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              vin: true,
              licensePlate: true,
              mileage: true,
              customer: { select: { name: true, email: true, phone: true } },
            },
          },
          template: { select: { name: true, severityScale: true, country: true } },
          items: { orderBy: { sortOrder: 'asc' } },
          // What the workshop chose to show of the files on the inspection itself.
          attachments: { where: { includeInReport: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
      db.appSetting.findMany({ where: { organizationId: ctx.organizationId } }),
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      }),
    ])

    if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

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

    const features = await getFeatures(ctx.organizationId)
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

    // Photos are an enhancement; the certificate is the document. Anything that
    // goes wrong embedding them is logged and dropped rather than allowed to
    // fail a download of a report the workshop has already issued.
    let photos: Awaited<ReturnType<typeof loadInspectionPhotos>>['photos'] = {}
    let photosOmitted = 0
    try {
      ;({ photos, omitted: photosOmitted } = await loadInspectionPhotos(inspection.items))
    } catch (error) {
      console.error('[Inspection PDF] Photo embedding failed, rendering without photos:', error)
    }

    let overviewPhotos: Awaited<ReturnType<typeof loadInspectionOverviewPhotos>>['photos'] = []
    try {
      const overview = await loadInspectionOverviewPhotos(inspection.attachments)
      overviewPhotos = overview.photos
      photosOmitted += overview.omitted
    } catch (error) {
      console.error(
        '[Inspection PDF] Overview photo embedding failed, rendering without them:',
        error
      )
    }
    const documents = certificateDocuments(inspection.attachments)

    const element = React.createElement(InspectionPDF, {
      data: inspection,
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
    const fileName = `Inspection-${vehicleName}.pdf`

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('[Inspection PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
