import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { InvoiceView } from './invoice-view'
import { getFeatures } from '@/lib/features'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
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

  const record = await db.serviceRecord.findUnique({
    where: { publicToken: token },
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
        },
      },
      laborItems: true,
      technician: { select: { name: true } },
      attachments: true,
      payments: { orderBy: { date: 'desc' } },
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
          mileage: true,
          userId: true,
          organizationId: true,
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
        },
      },
    },
  })

  if (!record || record.organizationId !== orgId) {
    notFound()
  }

  // Fetch workshop settings and features
  const [settings, org, features] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: record.organizationId,
        key: {
          in: [
            'workshop.address',
            'workshop.phone',
            'workshop.email',
            'workshop.slogan',
            'workshop.logo',
            'invoice.logo',
            'workshop.unitSystem',
            'workshop.currencyCode',
            'workshop.currencyFormat',
            'invoice.bankAccount',
            'invoice.orgNumber',
            'invoice.paymentTerms',
            'invoice.footerNote',
            'invoice.showBankAccount',
            'invoice.showOrgNumber',
            'invoice.dueDays',
            'invoice.showLogo',
            'invoice.showCompanyName',
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
            'invoice.logoSize',
            'payment.providersEnabled',
            'payment.termsOfSale',
            'payment.termsOfSaleUrl',
            'workshop.dateFormat',
            'workshop.timezone',
            'workshop.serviceType',
            'workshop.taxLabel',
            'portal.enabled',
            'invoice.layoutConfig',
            'telegram.botUsername',
          ],
        },
      },
    }),
    record.organizationId
      ? db.organization.findUnique({
          where: { id: record.organizationId },
          select: { name: true, portalSlug: true },
        })
      : null,
    getFeatures(orgId),
  ])

  // Fetch findings for this service record (open ones to show on invoice)
  const findings = await db.vehicleFinding.findMany({
    where: { serviceRecordId: record.id, status: { not: 'resolved' } },
    select: { description: true, severity: true, notes: true },
    orderBy: { createdAt: 'desc' },
  })

  // Fetch custom field values for this service record
  const customFields = await getCustomFieldsForPrint(orgId, record.id, 'service_record')

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

  const invoiceSettings = {
    bankAccount: settingsMap['invoice.bankAccount'] || '',
    orgNumber: settingsMap['invoice.orgNumber'] || '',
    paymentTerms: settingsMap['invoice.paymentTerms'] || '',
    footerNote: settingsMap['invoice.footerNote'] || '',
    showBankAccount: settingsMap['invoice.showBankAccount'] !== 'false',
    showOrgNumber: settingsMap['invoice.showOrgNumber'] !== 'false',
    dueDays: Number(settingsMap['invoice.dueDays']) || 0,
  }

  const showLogo = settingsMap['invoice.showLogo'] !== 'false'
  const showCompanyName = settingsMap['invoice.showCompanyName'] !== 'false'
  const rawLogoUrl = documentLogoPath(settingsMap, 'invoice')
  const logoUrl = rawLogoUrl ? toPublicFileUrl(rawLogoUrl, token) : ''

  // Determine which online payment providers are enabled for this org
  const enabledProvidersRaw = settingsMap['payment.providersEnabled'] || ''
  const enabledProviders = enabledProvidersRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Rewrite attachment file URLs to use the public file route (no auth required)
  // Only include attachments marked for invoice display
  const publicRecord = {
    ...record,
    attachments: record.attachments
      .filter((att) => att.includeInInvoice !== false)
      .map((att) => ({
        ...att,
        fileUrl: toPublicFileUrl(att.fileUrl, token),
      })),
  }

  // Parse layout config
  const layoutConfig = mergeWithDefaults(
    settingsMap['invoice.layoutConfig'] ? JSON.parse(settingsMap['invoice.layoutConfig']) : {}
  )

  // The document the workshop designed, built here from the real job so the
  // page a customer opens is the sheet the designer shows and the PDF prints.
  const acceptLanguage = (await headers()).get('accept-language')
  const locale = await resolveCustomerLocale(record.organizationId, acceptLanguage)
  const labels = await loadPrintLabels(locale, settingsMap)

  const paidFromPayments = record.payments.reduce((sum, p) => sum + p.amount, 0)
  const effectiveTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
  const paymentSummary =
    record.payments.length > 0 || record.manuallyPaid
      ? {
          totalPaid: record.manuallyPaid ? effectiveTotal : paidFromPayments,
          payments: record.payments.map((p) => ({
            amount: p.amount,
            date: p.date.toLocaleDateString(),
            method: p.method,
          })),
        }
      : undefined

  const torqvoiceLogoDataUri = features.brandingRemoved
    ? undefined
    : await getTorqvoiceLogoDataUri()

  const spec = buildInvoicePrintSpec({
    data: { ...record, customFields, findings },
    workshop,
    invoiceSettings: {
      ...invoiceSettings,
      currencyCode,
      currencyFormat,
      unitSystem: settingsMap['workshop.unitSystem'] || undefined,
      dateFormat: settingsMap['workshop.dateFormat'] || undefined,
      timezone: settingsMap['workshop.timezone'] || undefined,
    },
    paymentSummary,
    logoDataUri: logoUrl || undefined,
    template: {
      primaryColor: settingsMap['invoice.primaryColor'] || '#d97706',
      backgroundColor: settingsMap['invoice.backgroundColor'] || undefined,
      textColor: settingsMap['invoice.textColor'] || undefined,
      companyTextColor: settingsMap['invoice.companyTextColor'] || undefined,
      frameBorderColor: settingsMap['invoice.frameBorderColor'] || undefined,
      frameShadow: settingsMap['invoice.frameShadow'],
      frameRadius: Number(settingsMap['invoice.frameRadius']) || 0,
      frameSide: settingsMap['invoice.frameSide'] === 'right' ? 'right' : 'left',
      fontFamily: settingsMap['invoice.fontFamily'] || 'Helvetica',
      showLogo,
      showCompanyName,
      headerStyle: settingsMap['invoice.headerStyle'] || 'standard',
      logoSize: Number(settingsMap['invoice.logoSize']) || 100,
      layoutConfig,
    },
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
  const telegramBotUsername = (await getOrgTelegramBotUsername(record.organizationId)) || ''
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
      logoUrl={logoUrl}
      showLogo={showLogo}
      showCompanyName={showCompanyName}
      showTorqvoiceBranding={!features.brandingRemoved}
      dateFormat={settingsMap['workshop.dateFormat'] || undefined}
      timezone={settingsMap['workshop.timezone'] || undefined}
      termsOfSaleUrl={termsOfSaleUrl}
      primaryColor={settingsMap['invoice.primaryColor'] || '#d97706'}
      headerStyle={settingsMap['invoice.headerStyle'] || 'standard'}
      logoSize={Number(settingsMap['invoice.logoSize']) || 100}
      portalUrl={portalUrl}
      layoutConfig={layoutConfig}
      customFields={customFields}
      findings={findings}
      telegramBotLink={telegramBotLink}
      serviceType={(settingsMap['workshop.serviceType'] || 'automotive') as 'automotive' | 'marine'}
      taxLabel={settingsMap['workshop.taxLabel']?.trim() || undefined}
    />
  )
}
