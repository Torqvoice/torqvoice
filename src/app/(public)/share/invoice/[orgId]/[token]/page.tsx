import { getTranslations } from 'next-intl/server'
import { resolveCurrencyCode, resolveCurrencyFormat } from '@/lib/currencies'
import { notFound } from 'next/navigation'
import { InvoiceView } from './invoice-view'
import { getFeatures } from '@/lib/features'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { visitConditionMapIn } from '@/features/condition-map/Lib/loadMarks.server'
import { linkedCertificateInspectionId } from '@/features/inspections/Lib/linkedCertificate.server'
import { assembleInvoicePrint } from '@/features/invoices/Lib/assembleInvoicePrint'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { documentCustomerId, telegramQrForPrint } from '@/features/invoices/Lib/telegramQr'
import { offeredPaymentProviders } from '@/features/integrations/Lib/payments'
import { getAppBaseUrl } from '@/lib/app-url'
import { closedShareLinkTitle, ShareLinkClosed } from '@/components/share-link-expired'
import { ShareLinkOpenUntil } from '@/components/share-link-open-until'
import { publicInvoiceRecord } from '@/lib/public-payload'
import { lookUpShareLink } from '@/lib/share-link.server'

/** Rewrites /api/protected/files/[orgId]/[category]/[filename] to /api/public/files/[token]/[category]/[filename] */
function toPublicFileUrl(fileUrl: string, token: string): string {
  const match = fileUrl.match(/^\/api\/protected\/files\/[^/]+\/(.+)$/)
  if (match) return `/api/public/files/${token}/${match[1]}`
  // Legacy URLs pass through as-is
  return fileUrl
}

export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}): Promise<Metadata> {
  const { orgId, token } = await params
  const link = await lookUpShareLink('invoice', orgId, token)
  const robots = { index: false, follow: false }
  // A closed link's tab does not say what the link led to.
  if (link.status === 'expired' || link.status === 'gone') {
    return { title: await closedShareLinkTitle(link.organizationId, link.status), robots }
  }
  const t = await getTranslations('share.invoice')
  return { title: t('title'), robots }
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Only an address with no workshop behind it is the plain 404. A customer
  // whose link is closed gets a page that tells them who to ask.
  const link = await lookUpShareLink('invoice', orgParam, token)
  if (link.status === 'unknownWorkshop') notFound()
  if (link.status !== 'open') {
    return (
      <ShareLinkClosed organizationId={link.organizationId} status={link.status} kind="invoice" />
    )
  }
  const { organizationId: orgId, shared } = link

  // The document as it was issued, or the live draft: one assembler decides,
  // and the page a customer opens is the sheet the PDF prints.
  const assembly = await assembleInvoicePrint(shared.id)
  if (!assembly) return <ShareLinkClosed organizationId={orgId} status="gone" kind="invoice" />
  const { record, settingsMap, org } = assembly

  const features = await getFeatures(orgId)

  const workshop = {
    name: assembly.workshop.name,
    address: assembly.workshop.address,
    phone: assembly.workshop.phone,
    email: assembly.workshop.email,
  }

  const currencyCode = resolveCurrencyCode(assembly.invoiceSettings.currencyCode)
  const currencyFormat: 'symbol' | 'code' = resolveCurrencyFormat(
    assembly.invoiceSettings.currencyFormat
  )

  const invoiceSettings = {
    bankAccount: assembly.invoiceSettings.bankAccount || '',
    orgNumber: assembly.invoiceSettings.orgNumber || '',
    paymentTerms: assembly.invoiceSettings.paymentTerms || '',
    footerNote: assembly.invoiceSettings.footerNote || '',
    showBankAccount: assembly.invoiceSettings.showBankAccount !== false,
    showOrgNumber: assembly.invoiceSettings.showOrgNumber !== false,
    dueDays: assembly.invoiceSettings.dueDays || 0,
  }

  const showLogo = assembly.template.showLogo !== false
  const showCompanyName = assembly.template.showCompanyName !== false

  // The vendors the customer can pay through, whichever side of the move
  // into the integrations catalog they were connected on.
  const enabledProviders = await offeredPaymentProviders(orgId)

  // What reaches the browser is named field by field, never the row: a prop
  // of a client component is readable by anyone holding the link, drawn or
  // not. The vehicle is the one the sheet prints, frozen at issue or live for
  // a draft, and attachment addresses go through the public file route.
  const publicRecord = publicInvoiceRecord(record, assembly.data.vehicle, (url) =>
    toPublicFileUrl(url, token)
  )

  const acceptLanguage = (await headers()).get('accept-language')
  const locale = await resolveCustomerLocale(orgId, acceptLanguage)
  const [labels, conditionMap, certificateInspection] = await Promise.all([
    loadPrintLabels(locale, assembly.labelSettings),
    visitConditionMapIn(orgId, assembly.conditionMap, locale),
    linkedCertificateInspectionId(orgId, record.inspectionId),
  ])

  // The Telegram code sits in the sheet, where the PDF prints it, so the
  // shared copy and the download are the same document.
  const [torqvoiceLogoDataUri, telegramQr] = await Promise.all([
    features.brandingRemoved ? undefined : getTorqvoiceLogoDataUri(),
    telegramQrForPrint(orgId, assembly.layoutConfig, documentCustomerId(assembly.record)),
  ])

  const spec = buildInvoicePrintSpec({
    data: assembly.data,
    workshop: assembly.workshop,
    invoiceSettings: assembly.invoiceSettings,
    paymentSummary: assembly.paymentSummary,
    logoDataUri: assembly.logoDataUri,
    signer: assembly.signer,
    template: assembly.template,
    torqvoiceLogoDataUri,
    telegramQrDataUri: telegramQr?.dataUri,
    telegramLabel: labels?.telegramConnect,
    labels,
    locale,
    conditionMap,
    inspectionResults: assembly.inspectionResults,
  })

  const termsOfSaleUrl =
    settingsMap['payment.termsOfSaleUrl'] ||
    (settingsMap['payment.termsOfSale'] ? `/share/terms/${orgId}` : undefined)

  const appUrl = getAppBaseUrl()
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  return (
    <InvoiceView
      spec={spec}
      record={publicRecord}
      workshop={workshop}
      currencyCode={currencyCode}
      currencyFormat={currencyFormat}
      orgId={orgId}
      token={token}
      enabledProviders={enabledProviders}
      invoiceSettings={invoiceSettings}
      logoUrl={assembly.logoDataUri || ''}
      showLogo={showLogo}
      showCompanyName={showCompanyName}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={assembly.invoiceSettings.dateFormat}
      timezone={assembly.invoiceSettings.timezone}
      termsOfSaleUrl={termsOfSaleUrl}
      primaryColor={assembly.template.primaryColor || '#d97706'}
      headerStyle={assembly.template.headerStyle || 'standard'}
      logoSize={assembly.template.logoSize || 100}
      portalUrl={portalUrl}
      layoutConfig={assembly.layoutConfig}
      customFields={assembly.data.customFields}
      findings={assembly.data.findings}
      serviceType={assembly.serviceType}
      taxLabel={assembly.taxLabel}
      expiryNote={<ShareLinkOpenUntil organizationId={orgId} expiry={shared.expiry} />}
      certificateUrl={
        certificateInspection
          ? `/api/public/share/invoice/${orgParam}/${token}/certificate`
          : undefined
      }
    />
  )
}
