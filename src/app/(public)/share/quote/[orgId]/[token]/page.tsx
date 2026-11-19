import { getTranslations } from 'next-intl/server'
import { resolveCurrencyCode, resolveCurrencyFormat } from '@/lib/currencies'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { QuoteView } from './quote-view'
import { getFeatures } from '@/lib/features'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { quoteConditionMap } from '@/features/condition-map/Lib/loadMarks.server'
import { linkedCertificateInspectionId } from '@/features/inspections/Lib/linkedCertificate.server'
import { inspectionResultsFor } from '@/features/inspections/Lib/linkedInspectionResults.server'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { getAppBaseUrl } from '@/lib/app-url'
import { closedShareLinkTitle, ShareLinkClosed } from '@/components/share-link-expired'
import { ShareLinkOpenUntil } from '@/components/share-link-open-until'
import { PUBLIC_QUOTE_SELECT, publicAttachment, publicQuoteRecord } from '@/lib/public-payload'
import { lookUpShareLink } from '@/lib/share-link.server'
import { documentSigner } from '@/features/signatures/Lib/memberSignature.server'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { gateTypeKey, typeKeyEnabledIn } from '@/features/vehicles/Lib/typeKeySetting'
import {
  customerReferenceEnabledIn,
  gateCustomerReference,
} from '@/features/customer-reference/Lib/referenceSetting'

export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}): Promise<Metadata> {
  const { orgId, token } = await params
  const link = await lookUpShareLink('quote', orgId, token)
  const robots = { index: false, follow: false }
  // A closed link's tab does not say what the link led to.
  if (link.status === 'expired' || link.status === 'gone') {
    return { title: await closedShareLinkTitle(link.organizationId, link.status), robots }
  }
  const t = await getTranslations('share.quote')
  return { title: t('title'), robots }
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Only an address with no workshop behind it is the plain 404. A customer
  // whose link is closed gets a page that tells them who to ask.
  const link = await lookUpShareLink('quote', orgParam, token)
  if (link.status === 'unknownWorkshop') notFound()
  if (link.status !== 'open') {
    return (
      <ShareLinkClosed organizationId={link.organizationId} status={link.status} kind="quote" />
    )
  }
  const { organizationId: orgId, shared } = link

  // Only the columns a customer's copy is built from are read: the
  // workshop's own notes and a line's cost and markup never leave the database.
  const quote = await db.quote.findFirst({
    where: { publicToken: token, organizationId: orgId },
    select: {
      ...PUBLIC_QUOTE_SELECT,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          category: true,
          description: true,
        },
      },
    },
  })

  if (!quote) return <ShareLinkClosed organizationId={orgId} status="gone" kind="quote" />

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
            'quote.logo',
            'workshop.currencyCode',
            'workshop.currencyFormat',
            'workshop.dateFormat',
            'workshop.timezone',
            'workshop.unitSystem',
            SETTING_KEYS.VEHICLE_TYPE_KEY_ENABLED,
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
            'workshop.orgNumberLabel',
            'invoice.lineItemsInclTax',
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
  const customFields = await getCustomFieldsForPrint(orgId, quote.id, 'quote')

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value
  const typeKeyEnabled = typeKeyEnabledIn(settingsMap)
  // Without the type key and without the customer's reference / PO, for a
  // workshop that has those fields off.
  const shownQuote = gateCustomerReference(
    {
      ...quote,
      vehicle: quote.vehicle && gateTypeKey(quote.vehicle, typeKeyEnabled),
    },
    customerReferenceEnabledIn(settingsMap, features)
  )

  const workshop = {
    name: org?.name || '',
    address: settingsMap['workshop.address'] || '',
    phone: settingsMap['workshop.phone'] || '',
    email: settingsMap['workshop.email'] || '',
    slogan: settingsMap['workshop.slogan'] || undefined,
  }

  const currencyCode = resolveCurrencyCode(settingsMap['workshop.currencyCode'])
  const currencyFormat: 'symbol' | 'code' = resolveCurrencyFormat(
    settingsMap['workshop.currencyFormat']
  )

  // Rewrite logo URL for public access
  const rawLogoUrl = documentLogoPath(settingsMap, 'quote')
  let logoUrl = ''
  if (rawLogoUrl) {
    const match = rawLogoUrl.match(/^\/api\/files\/[^/]+\/(.+)$/)
    if (match) logoUrl = `/api/public/files/${token}/${match[1]}`
    else logoUrl = rawLogoUrl
  }

  // Attachments, named field by field, with addresses this link's token opens.
  const toPublicUrl = (url: string) =>
    url.replace(/^\/api\/protected\/files\/[^/]+\//, `/api/public/files/${token}/`)
  const attachmentsOf = (category: string) =>
    quote.attachments
      .filter((file) => file.category === category)
      .map((file) => publicAttachment(file, toPublicUrl))
  const imageAttachments = attachmentsOf('image')
  const documentAttachments = attachmentsOf('document')

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
  const [labels, conditionMap, certificateInspection, inspectionResults] = await Promise.all([
    loadPrintLabels(locale, settingsMap, 'quote'),
    quoteConditionMap(orgId, quote, locale),
    linkedCertificateInspectionId(orgId, quote.inspectionId),
    // The same results the PDF prints, read the same way.
    inspectionResultsFor(orgId, quote, layoutConfig),
  ])

  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  // Whoever wrote the quote signs it.
  const signer = await documentSigner(orgId, quote.userId)

  const spec = buildQuotePrintSpec({
    data: shownQuote,
    lineItemsInclTax: settingsMap['invoice.lineItemsInclTax'] === 'true',
    workshop,
    currencyCode,
    currencyFormat,
    logoDataUri: logoUrl || undefined,
    signer,
    torqvoiceLogoDataUri,
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
    unitSystem: settingsMap['workshop.unitSystem'] || 'imperial',
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
    labels,
    locale,
    layoutConfig,
    conditionMap,
    inspectionResults,
  })

  const appUrl = getAppBaseUrl()
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  return (
    <QuoteView
      spec={spec}
      quote={publicQuoteRecord(quote)}
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
      serviceType={(settingsMap['workshop.serviceType'] || 'automotive') as 'automotive' | 'marine'}
      taxLabel={settingsMap['workshop.taxLabel']?.trim() || undefined}
      expiryNote={<ShareLinkOpenUntil organizationId={orgId} expiry={shared.expiry} />}
      certificateUrl={
        certificateInspection
          ? `/api/public/share/quote/${orgParam}/${token}/certificate`
          : undefined
      }
    />
  )
}
