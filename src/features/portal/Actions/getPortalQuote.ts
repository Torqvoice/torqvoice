'use server'

import { readFile } from 'node:fs/promises'
import { headers } from 'next/headers'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { quoteConditionMap } from '@/features/condition-map/Lib/loadMarks.server'
import { inspectionResultsFor } from '@/features/inspections/Lib/linkedInspectionResults.server'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { SENT_TO_CUSTOMER, quoteAwaitsAnswer } from '@/features/portal/Lib/quoteVisibility'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { documentSigner } from '@/features/signatures/Lib/memberSignature.server'
import { gateTypeKey, typeKeyEnabledIn } from '@/features/vehicles/Lib/typeKeySetting'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { resolveCurrencyCode, resolveCurrencyFormat } from '@/lib/currencies'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { resolveWorkshopTimeZone } from '@/lib/timezone'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'

const LOGO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/**
 * The workshop's quote logo as bytes on the page. The shared page points at
 * the file route its link's token opens; a signed-in customer has no token,
 * so the logo is read here instead. A missing file leaves the sheet without one.
 */
async function logoDataUri(settingsMap: Record<string, string>): Promise<string | undefined> {
  const logoPath = documentLogoPath(settingsMap, 'quote')
  if (!logoPath) return undefined
  try {
    const bytes = await readFile(resolveUploadPath(logoPath))
    const ext = logoPath.split('.').pop()?.toLowerCase() || 'png'
    return `data:${LOGO_MIME[ext] || 'image/png'};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * One quote for the signed-in customer, as the sheet the shared quote page and
 * the PDF draw, built the same way. Only the customer's own quotes in this
 * workshop that reached them; a draft, or anyone else's quote, is null.
 */
export async function getPortalQuote(quoteId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, customerId, organizationId, ...SENT_TO_CUSTOMER },
      include: {
        // Explicit select: internal unitCost/markupPercent never reach the customer.
        partItems: {
          select: {
            id: true,
            partNumber: true,
            name: true,
            quantity: true,
            unit: true,
            category: true,
            unitPrice: true,
            total: true,
            excluded: true,
            taxable: true,
          },
        },
        laborItems: true,
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
            hsn: true,
            tsn: true,
          },
        },
      },
    })
    if (!quote) return null

    const [settings, org, features] = await Promise.all([
      db.appSetting.findMany({ where: { organizationId } }),
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      getFeatures(organizationId),
    ])
    const settingsMap: Record<string, string> = {}
    for (const s of settings) settingsMap[s.key] = s.value

    const shownQuote = {
      ...quote,
      vehicle: quote.vehicle && gateTypeKey(quote.vehicle, typeKeyEnabledIn(settingsMap)),
    }
    const workshop = {
      name: org?.name || '',
      address: settingsMap['workshop.address'] || '',
      phone: settingsMap['workshop.phone'] || '',
      email: settingsMap['workshop.email'] || '',
      slogan: settingsMap['workshop.slogan'] || undefined,
    }
    const layoutConfig = mergeWithDefaults(
      settingsMap['quote.layoutConfig'] ? JSON.parse(settingsMap['quote.layoutConfig']) : {}
    )
    const pick = (key: string) => settingsMap[`quote.${key}`] || settingsMap[`invoice.${key}`]

    const acceptLanguage = (await headers()).get('accept-language')
    const locale = await resolveCustomerLocale(organizationId, acceptLanguage)
    const [labels, conditionMap, inspectionResults, customFields, signer, logo] = await Promise.all(
      [
        loadPrintLabels(locale, settingsMap, 'quote'),
        quoteConditionMap(organizationId, quote, locale),
        inspectionResultsFor(organizationId, quote, layoutConfig),
        getCustomFieldsForPrint(organizationId, quote.id, 'quote'),
        documentSigner(organizationId, quote.userId),
        logoDataUri(settingsMap),
      ]
    )
    const torqvoiceLogoDataUri = features.brandingRemoved
      ? undefined
      : await getTorqvoiceLogoDataUri()

    const spec = buildQuotePrintSpec({
      data: shownQuote,
      lineItemsInclTax: settingsMap['invoice.lineItemsInclTax'] === 'true',
      workshop,
      currencyCode: resolveCurrencyCode(settingsMap['workshop.currencyCode']),
      currencyFormat: resolveCurrencyFormat(settingsMap['workshop.currencyFormat']),
      logoDataUri: logo,
      signer,
      torqvoiceLogoDataUri,
      dateFormat: settingsMap['workshop.dateFormat'] || undefined,
      timezone: settingsMap['workshop.timezone'] || undefined,
      unitSystem: settingsMap['workshop.unitSystem'] || 'imperial',
      template: {
        primaryColor: pick('primaryColor') || '#d97706',
        backgroundColor: pick('backgroundColor') || undefined,
        textColor: pick('textColor') || undefined,
        companyTextColor: pick('companyTextColor') || undefined,
        frameBorderColor: pick('frameBorderColor') || undefined,
        frameShadow: pick('frameShadow'),
        frameRadius: Number(pick('frameRadius')) || 0,
        frameSide: pick('frameSide') === 'right' ? 'right' : 'left',
        fontFamily: pick('fontFamily') || 'Helvetica',
        headerStyle: pick('headerStyle') || 'standard',
        logoSize: Number(settingsMap['quote.logoSize']) || 100,
      },
      customFields,
      labels,
      locale,
      layoutConfig,
      conditionMap,
      inspectionResults,
    })

    return {
      id: quote.id,
      title: quote.title,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      totalAmount: quote.totalAmount,
      validUntil: quote.validUntil?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
      vehicle: quote.vehicle
        ? { make: quote.vehicle.make, model: quote.vehicle.model, year: quote.vehicle.year }
        : null,
      /** Sent, unanswered and still valid on the workshop's day: the customer may answer it. */
      awaitsAnswer: quoteAwaitsAnswer(
        quote,
        resolveWorkshopTimeZone(
          settingsMap[SETTING_KEYS.TIMEZONE],
          settingsMap[SETTING_KEYS.TIMEZONE_DETECTED]
        )
      ),
      spec,
    }
  })
}
