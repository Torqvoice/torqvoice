import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { InvoiceView } from './invoice-view'
import { getFeatures } from '@/lib/features'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { assembleInvoicePrint } from '@/features/invoices/Lib/assembleInvoicePrint'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getOrgTelegramBotUsername } from '@/lib/telegram'

/** Rewrites /api/protected/files/[orgId]/[category]/[filename] to /api/public/files/[token]/[category]/[filename] */
function toPublicFileUrl(fileUrl: string, token: string): string {
  const match = fileUrl.match(/^\/api\/protected\/files\/[^/]+\/(.+)$/)
  if (match) return `/api/public/files/${token}/${match[1]}`
  // Legacy URLs pass through as-is
  return fileUrl
}

export const revalidate = 60

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
  const resolvedOrg = await resolvePortalOrg(orgParam)
  const orgId = resolvedOrg?.id ?? orgParam

  const shared = await db.serviceRecord.findUnique({
    where: { publicToken: token },
    select: { id: true, organizationId: true },
  })
  if (!shared || shared.organizationId !== orgId) {
    notFound()
  }

  // The document as it was issued, or the live draft: one assembler decides,
  // and the page a customer opens is the sheet the PDF prints.
  const assembly = await assembleInvoicePrint(shared.id)
  if (!assembly) notFound()
  const { record, settingsMap, org } = assembly

  const features = await getFeatures(orgId)

  const workshop = {
    name: assembly.workshop.name,
    address: assembly.workshop.address,
    phone: assembly.workshop.phone,
    email: assembly.workshop.email,
  }

  const currencyCode = assembly.invoiceSettings.currencyCode || 'USD'
  const currencyFormat: 'symbol' | 'code' = assembly.invoiceSettings.currencyFormat || 'symbol'

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

  // Determine which online payment providers are enabled for this org
  const enabledProvidersRaw = settingsMap['payment.providersEnabled'] || ''
  const enabledProviders = enabledProvidersRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // What reaches the browser: internal unitCost/markupPercent must never be
  // in the customer-facing payload, attachment URLs go through the public
  // file route, and the customer, vehicle and technician are the ones the
  // sheet prints, frozen at issue or live for a draft.
  const publicRecord = {
    ...record,
    techName: assembly.data.techName,
    customer: assembly.data.customer,
    vehicle: assembly.data.vehicle,
    partItems: record.partItems.map((p) => ({
      id: p.id,
      partNumber: p.partNumber,
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      unitPrice: p.unitPrice,
      total: p.total,
    })),
    attachments: record.attachments
      .filter((att) => att.includeInInvoice !== false)
      .map((att) => ({
        ...att,
        fileUrl: toPublicFileUrl(att.fileUrl, token),
      })),
  }

  const acceptLanguage = (await headers()).get('accept-language')
  const locale = await resolveCustomerLocale(orgId, acceptLanguage)
  const labels = await loadPrintLabels(locale, assembly.labelSettings)

  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  const spec = buildInvoicePrintSpec({
    data: assembly.data,
    workshop: assembly.workshop,
    invoiceSettings: assembly.invoiceSettings,
    paymentSummary: assembly.paymentSummary,
    logoDataUri: assembly.logoDataUri,
    template: assembly.template,
    torqvoiceLogoDataUri,
    labels,
  })

  const termsOfSaleUrl =
    settingsMap['payment.termsOfSaleUrl'] ||
    (settingsMap['payment.termsOfSale'] ? `/share/terms/${orgId}` : undefined)

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  // The bot follows the Telegram integration, whichever side of the move it
  // was connected on.
  const telegramBotUsername = (await getOrgTelegramBotUsername(orgId)) || ''
  const telegramBotLink = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : undefined

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
      telegramBotLink={telegramBotLink}
      serviceType={assembly.serviceType}
      taxLabel={assembly.taxLabel}
    />
  )
}
