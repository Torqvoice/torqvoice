import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { InspectionView } from './inspection-view'
import { getFeatures } from '@/lib/features'
import { resolvePortalOrg } from '@/lib/portal-slug'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getAppBaseUrl } from '@/lib/app-url'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { templateConfigFromSource } from '@/features/invoice-designer/Lib/designSource'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import { buildCertificatePrintSpec } from '@/features/inspections/Pdf/buildCertificatePrint'
import { loadVehicleConditionMarks } from '@/features/condition-map/Actions/conditionMarkActions'
import { loadConditionMapLabels } from '@/features/condition-map/Lib/labels'
import { certificateSignatureDataUri } from '@/features/signatures/Lib/memberSignature.server'
import {
  certificateDesignSource,
  loadCertificateLabels,
} from '@/features/inspections/Pdf/certificateDesign'
import { certificateDocuments } from '@/features/inspections/Lib/certificateDocuments'

export const revalidate = 60

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PublicInspectionPage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
  const resolvedOrg = await resolvePortalOrg(orgParam)
  const orgId = resolvedOrg?.id ?? orgParam

  const inspection = await db.inspection.findFirst({
    where: { publicToken: token, organizationId: orgId },
    include: {
      vehicle: {
        select: {
          bodyType: true,
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
          mileage: true,
          // Data minimisation (GDPR Art. 5(1)(c)): this page is reachable by
          // anyone holding the link, so the customer's contact details are
          // never loaded for it — the name is all the report needs to identify
          // whose vehicle it is.
          customer: { select: { name: true } },
        },
      },
      template: { select: { name: true, severityScale: true, country: true } },
      technician: { select: { name: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      // Only what the workshop chose to show the customer.
      attachments: {
        where: { includeInReport: true },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          description: true,
          includeInReport: true,
        },
      },
      quotes: {
        where: { publicToken: { not: null } },
        select: { publicToken: true },
        take: 1,
      },
    },
  })

  if (!inspection) {
    notFound()
  }

  // Every setting, as the PDF loads them: the certificate design reads its
  // own keys and falls back to the invoice's, and which of those a saved
  // design needs is not known until it is parsed. Only the values picked
  // below reach the customer's browser.
  const [settings, org, features, existingRequest] = await Promise.all([
    db.appSetting.findMany({ where: { organizationId: orgId } }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true, portalSlug: true },
    }),
    getFeatures(orgId),
    db.inspectionQuoteRequest.findFirst({
      where: { inspectionId: inspection.id, status: 'pending' },
      select: { id: true },
    }),
  ])

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const workshop = {
    name: org?.name || '',
    address: settingsMap['workshop.address'] || '',
    phone: settingsMap['workshop.phone'] || '',
    email: settingsMap['workshop.email'] || '',
  }

  // Uploads are addressed through the signed-in file route, in either of the
  // forms it has had; the customer has no session, so each is rewritten to
  // the route this link's token opens. Before this only the older form was,
  // and every photo uploaded since showed the customer a broken image.
  const toPublic = (url: string) => {
    const match = url.match(/^\/api\/(?:protected\/)?files\/[^/]+\/(.+)$/)
    return match ? `/api/public/files/${token}/${match[1]}` : url
  }
  const logoUrl = toPublic(settingsMap['workshop.logo'] || '')

  const primaryColor = settingsMap['invoice.primaryColor'] || '#d97706'

  const appUrl = getAppBaseUrl()
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  const publicInspection = {
    ...inspection,
    items: inspection.items.map((item) => ({
      ...item,
      imageUrls: item.imageUrls.map(toPublic),
    })),
    attachments: inspection.attachments.map((file) => ({
      ...file,
      fileUrl: toPublic(file.fileUrl),
    })),
  }

  const linkedQuote = inspection.quotes?.[0]
  const quoteShareUrl = linkedQuote?.publicToken
    ? `/share/quote/${orgId}/${linkedQuote.publicToken}`
    : undefined

  // The certificate the workshop designed, built from the real inspection so
  // the page a customer opens is the sheet the designer shows and the PDF
  // prints. A workshop that never designed one gets the built-in report, as
  // before. Photos are the browser's to fetch, through the token's file
  // route, so nothing is embedded here.
  const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url)
  const source = await certificateDesignSource(orgId, inspection, settingsMap)
  let spec: DocumentSpec | undefined
  if (source) {
    const acceptLanguage = (await headers()).get('accept-language')
    const locale = await resolveCustomerLocale(orgId, acceptLanguage)
    const labels = await loadCertificateLabels(locale, settingsMap)
    const design = templateConfigFromSource(source)
    const itemPhotos: Record<string, { dataUri: string }[]> = {}
    for (const item of publicInspection.items) {
      const photos = item.imageUrls.filter((url) => !isVideo(url)).map((url) => ({ dataUri: url }))
      if (photos.length > 0) itemPhotos[item.id] = photos
    }
    const hasMap = inspection.items.some((item) => item.inputType === 'condition_map')
    spec = buildCertificatePrintSpec({
      data: inspection,
      conditionMarks: hasMap ? await loadVehicleConditionMarks(orgId, inspection.vehicleId) : [],
      bodyType: hasMap ? inspection.vehicle.bodyType : null,
      conditionMapLabels: hasMap ? await loadConditionMapLabels(locale) : undefined,
      workshop: { ...workshop, slogan: settingsMap['workshop.slogan'] || undefined },
      labels,
      logoDataUri: toPublic(documentLogoPath(settingsMap, 'certificate')) || undefined,
      signatureDataUri: await certificateSignatureDataUri(orgId, inspection),
      torqvoiceLogoDataUri: features.brandingRemoved ? undefined : await getTorqvoiceLogoDataUri(),
      dateFormat: settingsMap['workshop.dateFormat'] || undefined,
      timezone: settingsMap['workshop.timezone'] || undefined,
      template: design,
      layoutConfig: design.layoutConfig,
      portalUrl,
      itemPhotos,
      overviewPhotos: publicInspection.attachments
        .filter((file) => file.fileType.startsWith('image/'))
        .map((file) => ({ dataUri: file.fileUrl, caption: file.description })),
      attachedDocuments: certificateDocuments(inspection.attachments).map((file) => file.fileName),
    })
  }

  return (
    <InspectionView
      inspection={publicInspection}
      spec={spec}
      workshop={workshop}
      logoUrl={logoUrl}
      primaryColor={primaryColor}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap['workshop.dateFormat'] || undefined}
      timezone={settingsMap['workshop.timezone'] || undefined}
      publicToken={token}
      orgId={orgId}
      hasExistingQuoteRequest={!!existingRequest}
      quoteShareUrl={quoteShareUrl}
      portalUrl={portalUrl}
      serviceType={(settingsMap['workshop.serviceType'] || 'automotive') as 'automotive' | 'marine'}
    />
  )
}
