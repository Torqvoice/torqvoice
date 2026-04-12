/**
 * Shared invoice PDF builder.
 *
 * This helper renders an invoice PDF for a given service record id. It is used
 * by both the public share-token PDF route and the customer-portal session PDF
 * route. The caller is responsible for verifying that the requester is allowed
 * to access the record — this helper trusts the caller and only validates that
 * the record exists.
 *
 * The file is intentionally long because building the PDF requires:
 *   - loading the service record with all related items
 *   - loading findings and custom fields
 *   - loading workshop settings, organization info and the layout config
 *   - resolving the customer locale and PDF translations
 *   - reading the workshop logo from disk and converting it to a data URI
 *   - optionally generating a Telegram QR code
 *   - resolving Torqvoice branding visibility
 *   - constructing the InvoicePDF React element and rendering it to a buffer
 *
 * Splitting these into separate modules would just spread the same logic
 * across multiple files without making it easier to read, so they live here
 * with a couple of small internal helpers.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { readFile } from 'fs/promises'
import { db } from '@/lib/db'
import { InvoicePDF } from '@/features/vehicles/Components/InvoicePDF'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { formatDateForPdf } from '@/lib/format'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'

type PdfMessages = Record<string, Record<string, string>>

async function loadPdfMessages(locale: string): Promise<PdfMessages> {
  try {
    return (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    return (await import(`../../../../messages/en/pdf.json`)).default
  }
}

async function loadLogoDataUri(logoPath: string | undefined): Promise<string | undefined> {
  if (!logoPath) return undefined
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
    return `data:${mime};base64,${logoBuffer.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function buildInvoicePdfBuffer(
  serviceRecordId: string,
  acceptLanguageHeader: string | null
): Promise<{ buffer: Uint8Array; filename: string } | null> {
  const record = await db.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    include: {
      partItems: true,
      laborItems: true,
      payments: { orderBy: { date: 'desc' } },
      // Linked technician (FK) is the source of truth for the tech name;
      // the legacy `techName` string is only a fallback for old records.
      technician: { select: { name: true } },
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

  if (!record) return null

  const orgId = record.vehicle.organizationId
  if (!orgId) return null

  // Resolve locale + load PDF translations
  const locale = await resolveCustomerLocale(orgId, acceptLanguageHeader)
  const pdfMessages = await loadPdfMessages(locale)
  const labels = {
    ...pdfMessages.invoice,
    ...pdfMessages.common,
  }

  // Fetch findings for this service record (open ones to show on invoice)
  const findings = await db.vehicleFinding.findMany({
    where: { serviceRecordId: record.id, status: { not: 'resolved' } },
    select: { description: true, severity: true, notes: true },
    orderBy: { createdAt: 'desc' },
  })

  // Fetch custom field values for this service record
  const customFieldValues = await db.customFieldValue.findMany({
    where: { entityId: record.id, entityType: 'service_record' },
    include: {
      field: { select: { label: true, fieldType: true, isActive: true, sortOrder: true } },
    },
    orderBy: { field: { sortOrder: 'asc' } },
  })

  const customFields = customFieldValues
    .filter((v) => v.field.isActive && v.value)
    .map((v) => ({
      fieldId: v.fieldId,
      label: v.field.label,
      value: v.value,
      fieldType: v.field.fieldType,
    }))

  const [settings, org] = await Promise.all([
    db.appSetting.findMany({
      where: { organizationId: orgId },
    }),
    orgId
      ? db.organization.findUnique({
          where: { id: orgId },
          select: { name: true, portalSlug: true },
        })
      : null,
  ])

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  // Override labels for marine service type
  const serviceType = settingsMap['workshop.serviceType'] || 'automotive'
  if (serviceType === 'marine') {
    if (pdfMessages.invoice.mileageMarine) labels.mileage = pdfMessages.invoice.mileageMarine
    if (pdfMessages.invoice.vinMarine) labels.vin = pdfMessages.invoice.vinMarine
    if (pdfMessages.invoice.plateMarine) labels.plate = pdfMessages.invoice.plateMarine
    if (pdfMessages.invoice.vehicleMarine) labels.vehicle = pdfMessages.invoice.vehicleMarine
    // Override unit labels for engine hours
    labels.km = 'hrs'
    labels.mi = 'hrs'
  }

  // Custom tax label override (e.g. "VAT", "MVA", "GST", "MwSt.")
  const customTaxLabel = settingsMap['workshop.taxLabel']?.trim()
  if (customTaxLabel) {
    labels.tax = `${customTaxLabel} ({rate}%)`
  }

  const logoDataUri = await loadLogoDataUri(settingsMap['workshop.logo'])

  const invoiceSettings = {
    bankAccount: settingsMap['invoice.bankAccount'] || '',
    orgNumber: settingsMap['invoice.orgNumber'] || '',
    paymentTerms: settingsMap['invoice.paymentTerms'] || '',
    footerNote: settingsMap['invoice.footerNote'] || '',
    showBankAccount: settingsMap['invoice.showBankAccount'] === 'true',
    showOrgNumber: settingsMap['invoice.showOrgNumber'] === 'true',
    dueDays: Number(settingsMap['invoice.dueDays']) || 0,
    currencyCode: settingsMap['workshop.currencyCode'] || 'USD',
    unitSystem: settingsMap['workshop.unitSystem'] || 'imperial',
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
  }

  const pdfDateFormat = settingsMap['workshop.dateFormat'] || undefined
  const pdfTimezone = settingsMap['workshop.timezone'] || undefined

  const paidFromPayments = record.payments.reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  )
  const effectiveTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
  const totalPaidForPdf = record.manuallyPaid ? effectiveTotal : paidFromPayments

  const paymentSummary =
    record.payments.length > 0 || record.manuallyPaid
      ? {
          totalPaid: totalPaidForPdf,
          payments: record.payments.map((p: { amount: number; date: Date; method: string }) => ({
            amount: p.amount,
            date: formatDateForPdf(p.date, pdfDateFormat, pdfTimezone),
            method: p.method,
          })),
        }
      : undefined

  // Fetch layout config
  const layoutConfigSetting = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: 'invoice.layoutConfig' } },
  })
  const layoutConfig = mergeWithDefaults(
    layoutConfigSetting?.value ? JSON.parse(layoutConfigSetting.value) : {}
  )

  const template = {
    primaryColor: settingsMap['invoice.primaryColor'] || '#d97706',
    fontFamily: settingsMap['invoice.fontFamily'] || 'Helvetica',
    showLogo: settingsMap['invoice.showLogo'] !== 'false',
    showCompanyName: settingsMap['invoice.showCompanyName'] !== 'false',
    headerStyle: settingsMap['invoice.headerStyle'] || 'standard',
    logoSize: Number(settingsMap['invoice.logoSize']) || 100,
    layoutConfig,
  }

  // Check if Torqvoice branding should be shown
  const features = await getFeatures(orgId)
  let torqvoiceLogoDataUri: string | undefined
  if (!features.brandingRemoved) {
    torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri()
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const portalSlug = org?.portalSlug
  const portalEnabled = settingsMap['portal.enabled'] === 'true'
  const portalUrl = portalEnabled ? `${appUrl}/portal/${portalSlug || orgId}` : undefined

  // Generate Telegram QR if the telegram_qr section is visible in layout
  let telegramQrDataUri: string | undefined
  const telegramBotUsername = settingsMap['telegram.botUsername']
  const telegramQrVisible = layoutConfig.sections.some(
    (s: { id: string; visible: boolean }) => s.id === 'telegram_qr' && s.visible
  )
  if (telegramBotUsername && telegramQrVisible) {
    const { generateQrDataUri } = await import('@/lib/qr')
    telegramQrDataUri = await generateQrDataUri(`https://t.me/${telegramBotUsername}`, 200)
  }

  const element = React.createElement(InvoicePDF, {
    data: { ...record, customFields, findings },
    workshop: {
      name: org?.name || '',
      address: settingsMap['workshop.address'] || '',
      phone: settingsMap['workshop.phone'] || '',
      email: settingsMap['workshop.email'] || '',
    },
    invoiceSettings,
    paymentSummary,
    logoDataUri,
    template,
    torqvoiceLogoDataUri,
    portalUrl,
    telegramQrDataUri,
    telegramLabel: labels?.telegramConnect || 'Chat with us on Telegram',
    labels,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const buffer = await renderToBuffer(element)

  const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`

  return {
    buffer,
    filename: `${invoiceNum}.pdf`,
  }
}
