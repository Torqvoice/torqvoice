'use server'

import { printableMeterReadings } from '@/features/meters/Lib/meters.server'
import { readFile } from 'node:fs/promises'
import { headers } from 'next/headers'
import {
  getCustomFieldsForPrint,
  getRecordCustomFieldsForPrint,
} from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { fleetNumberEnabledIn, gateFleetNumber } from '@/features/vehicles/Lib/fleetNumberSetting'
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
import {
  customerReferenceEnabledIn,
  gateCustomerReference,
} from '@/features/customer-reference/Lib/referenceSetting'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { resolveCurrencyCode, resolveCurrencyFormat } from '@/lib/currencies'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PUBLIC_QUOTE_SELECT } from '@/lib/public-payload'
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
      // Only the columns a customer's copy is built from; the workshop's
      // own notes and a line's cost and markup are never read.
      select: PUBLIC_QUOTE_SELECT,
    })
    if (!quote) return null

    const [settings, org, features] = await Promise.all([
      db.appSetting.findMany({ where: { organizationId } }),
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      getFeatures(organizationId),
    ])
    const settingsMap: Record<string, string> = {}
    for (const s of settings) settingsMap[s.key] = s.value

    // Without the type key and without the customer's reference / PO, for a
    // workshop that has those fields off.
    const shownQuote = gateCustomerReference(
      {
        ...quote,
        vehicle: quote.vehicle && {
          ...gateFleetNumber(
            gateTypeKey(quote.vehicle, typeKeyEnabledIn(settingsMap)),
            fleetNumberEnabledIn(settingsMap, features)
          ),
          // The vehicle's current meter readings, for a workshop that has meters.
          meterReadings: await printableMeterReadings(organizationId, {
            vehicleId: quote.vehicleId,
          }),
        },
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
      recordCustomFields: await getRecordCustomFieldsForPrint(organizationId, quote),
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
      // The customer's own reference / PO; null for a workshop with the field off.
      customerReference: shownQuote.customerReference ?? null,
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
