import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { QuoteView } from './quote-view'
import { getFeatures } from '@/lib/features'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { headers } from 'next/headers'
import type { Metadata } from 'next'

export const revalidate = 60

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
  const resolvedOrg = await resolvePortalOrg(orgParam)
  const orgId = resolvedOrg?.id ?? orgParam

  const quote = await db.quote.findFirst({
    where: { publicToken: token, organizationId: orgId },
    include: {
      // Explicit select: internal unitCost/markupPercent must never reach
      // the public customer-facing payload
      partItems: {
        select: {
          id: true,
          partNumber: true,
          name: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          total: true,
          excluded: true,
        },
      },
      laborItems: true,
      attachments: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
          address: true,
          company: true,
          taxId: true,
        },
      },
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
        },
      },
    },
  })

  if (!quote) {
    notFound()
  }

  const [settings, org, features] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            'workshop.address',
            'workshop.phone',
            'workshop.email',
            'workshop.slogan',
            'workshop.logo',
            'workshop.currencyCode',
            'workshop.currencyFormat',
            'workshop.dateFormat',
            'workshop.timezone',
            'quote.primaryColor',
            'quote.backgroundColor',
            'quote.textColor',
            'quote.companyTextColor',
            'quote.frameBorderColor',
            'quote.frameShadow',
            'quote.frameRadius',
            'quote.frameSide',
            'quote.fontFamily',
            'quote.headerStyle',
            'quote.logoSize',
            'invoice.primaryColor',
            'invoice.backgroundColor',
            'invoice.textColor',
            'invoice.companyTextColor',
            'invoice.frameBorderColor',
            'invoice.frameShadow',
            'invoice.frameRadius',
            'invoice.frameSide',
            'invoice.fontFamily',
            'invoice.headerStyle',
            'portal.enabled',
            'quote.layoutConfig',
            'workshop.serviceType',
            'workshop.taxLabel',
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true, portalSlug: true },
    }),
    getFeatures(orgId),
  ])

  // Fetch custom field values for this quote
  const customFieldValues = await db.customFieldValue.findMany({
    where: { entityId: quote.id, entityType: 'quote' },
    include: {
      field: {
        select: { id: true, label: true, fieldType: true, isActive: true, sortOrder: true },
      },
    },
    orderBy: { field: { sortOrder: 'asc' } },
  })

  const customFields = customFieldValues
    .filter((v) => v.field.isActive && v.value)
    .map((v) => ({
      label: v.field.label,
      value: v.value,
      fieldType: v.field.fieldType,
      fieldId: v.field.id,
    }))

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const workshop = {
    name: org?.name || '',
    address: settingsMap['workshop.address'] || '',
    phone: settingsMap['workshop.phone'] || '',
    email: settingsMap['workshop.email'] || '',
    slogan: settingsMap['workshop.slogan'] || undefined,
  }

  const currencyCode = settingsMap['workshop.currencyCode'] || 'USD'
  const currencyFormat: 'symbol' | 'code' =
    settingsMap['workshop.currencyFormat'] === 'code' ? 'code' : 'symbol'

  // Rewrite logo URL for public access
  const rawLogoUrl = settingsMap['workshop.logo'] || ''
  let logoUrl = ''
  if (rawLogoUrl) {
    const match = rawLogoUrl.match(/^\/api\/files\/[^/]+\/(.+)$/)
    if (match) logoUrl = `/api/public/files/${token}/${match[1]}`
    else logoUrl = rawLogoUrl
  }

  // Rewrite attachment URLs for public access
  const imageAttachments = (quote.attachments || [])
    .filter((a) => a.category === 'image')
    .map((a) => ({
      ...a,
      fileUrl: a.fileUrl.replace(
        /^\/api\/protected\/files\/[^/]+\//,
        `/api/public/files/${token}/`
      ),
    }))
  const documentAttachments = (quote.attachments || [])
    .filter((a) => a.category === 'document')
    .map((a) => ({
      ...a,
      fileUrl: a.fileUrl.replace(
        /^\/api\/protected\/files\/[^/]+\//,
        `/api/public/files/${token}/`
      ),
    }))

  // Parse layout config
  const layoutConfig = mergeWithDefaults(
    settingsMap['quote.layoutConfig'] ? JSON.parse(settingsMap['quote.layoutConfig']) : {}
  )

  const primaryColor =
    settingsMap['quote.primaryColor'] || settingsMap['invoice.primaryColor'] || '#d97706'
  const headerStyle =
    settingsMap['quote.headerStyle'] || settingsMap['invoice.headerStyle'] || 'standard'

  // The document the workshop designed, built here from the real quote so
  // the page a customer opens is the sheet the designer shows and the PDF
  // prints. Quote styling falls back to the invoice's where it is unset.
  const pick = (key: string) => settingsMap[`quote.${key}`] || settingsMap[`invoice.${key}`]
  const acceptLanguage = (await headers()).get('accept-language')
  const locale = await resolveCustomerLocale(orgId, acceptLanguage)
  const labels = await loadPrintLabels(locale, settingsMap)

  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  const spec = buildQuotePrintSpec({
    data: quote,
    workshop,
    currencyCode,
    currencyFormat,
    logoDataUri: logoUrl || undefined,
    torqvoiceLogoDataUri,
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
    template: {
      primaryColor,
      backgroundColor: pick('backgroundColor') || undefined,
      textColor: pick('textColor') || undefined,
      companyTextColor: pick('companyTextColor') || undefined,
      frameBorderColor: pick('frameBorderColor') || undefined,
      frameShadow: pick('frameShadow'),
      frameRadius: Number(pick('frameRadius')) || 0,
      frameSide: pick('frameSide') === 'right' ? 'right' : 'left',
      fontFamily: pick('fontFamily') || 'Helvetica',
      headerStyle,
      logoSize: Number(settingsMap['quote.logoSize']) || 100,
    },
    customFields,
    labels: {
      ...labels,
      title: labels.quoteTitle || 'QUOTE',
    },
    layoutConfig,
  })

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  return (
    <QuoteView
      spec={spec}
      quote={quote}
      workshop={workshop}
      currencyCode={currencyCode}
      currencyFormat={currencyFormat}
      orgId={orgId}
      token={token}
      logoUrl={logoUrl}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap['workshop.dateFormat'] || undefined}
      timezone={settingsMap['workshop.timezone'] || undefined}
      primaryColor={primaryColor}
      headerStyle={headerStyle}
      logoSize={Number(settingsMap['quote.logoSize']) || 100}
      portalUrl={portalUrl}
      imageAttachments={imageAttachments}
      documentAttachments={documentAttachments}
      layoutConfig={layoutConfig}
      customFields={customFields}
      serviceType={(settingsMap['workshop.serviceType'] || 'automotive') as 'automotive' | 'marine'}
      taxLabel={settingsMap['workshop.taxLabel']?.trim() || undefined}
    />
  )
}
