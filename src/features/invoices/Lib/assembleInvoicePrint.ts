/**
 * One place that turns an invoice into what the renderers take.
 *
 * Four routes used to assemble this by hand from live rows: the protected
 * PDF, the public share page, the shared PDF builder behind the customer
 * portal and the share link, and the email. Each read the workshop's
 * settings, the customer, the vehicle and the layout as they were at that
 * moment, so a customer who moved house rewrote every invoice ever sent to
 * them. Now there is one assembler, and it has two sources: live rows for a
 * draft, and the snapshots an invoice was issued with for everything else.
 *
 * Invoices sent before issuing existed keep printing from live rows until
 * they are sent again or frozen from invoice settings; nothing is captured
 * behind the workshop's back on a read.
 *
 * The result is the print builders' input, with the design as a source the
 * issue step can freeze. What a caller adds on top is whatever is not part
 * of the document: portal links, the Telegram code, Torqvoice branding, and
 * the reader's translations.
 */

import { readFile } from 'fs/promises'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { formatDateForPdf } from '@/lib/format'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type {
  InvoiceData,
  InvoiceSettingsProps,
  PaymentSummary,
  TemplateConfig,
  WorkshopInfo,
} from '@/features/vehicles/Components/invoice-pdf/types'
import {
  designSourceFromSettings,
  designSourceFromStored,
  templateConfigFromSource,
  type DesignSource,
} from '@/features/invoice-designer/Lib/designSource'
import { assetDataUri } from '@/features/invoice-designer/Lib/designSnapshots'
import { readIssuedInvoiceData, rendersFromIssue, type IssuedInvoiceData } from './issuedInvoice'

const PARTY_SELECT = {
  name: true,
  email: true,
  phone: true,
  address: true,
  company: true,
  taxId: true,
  customerNumber: true,
  invoiceDesignId: true,
} as const

const RECORD_INCLUDE = {
  partItems: true,
  laborItems: true,
  attachments: true,
  payments: { orderBy: { date: 'desc' as const } },
  // The linked technician's current name is the source of truth; the stored
  // techName string is only a fallback for records without the link.
  technician: { select: { name: true } },
  customer: { select: PARTY_SELECT },
  vehicle: {
    select: {
      make: true,
      model: true,
      year: true,
      vin: true,
      licensePlate: true,
      mileage: true,
      customer: { select: PARTY_SELECT },
    },
  },
  issuedDesignSnapshot: true,
  issuedLogoSnapshot: true,
}

export type InvoiceRecordForPrint = NonNullable<Awaited<ReturnType<typeof loadRecord>>>

async function loadRecord(recordId: string) {
  return db.serviceRecord.findUnique({ where: { id: recordId }, include: RECORD_INCLUDE })
}

export type PrintMode = 'auto' | 'live'

export interface AssembleOptions {
  /**
   * `auto` prints an issued invoice from its snapshots and a draft from live
   * rows. `live` always reads the rows, which is what issuing itself needs.
   */
  mode?: PrintMode
}

export interface InvoicePrintAssembly {
  record: InvoiceRecordForPrint
  organizationId: string
  org: { name: string; portalSlug: string | null } | null
  /** The workshop's live settings, for what is not part of the document. */
  settingsMap: Record<string, string>
  /** Set when the sheet comes from what was issued rather than live rows. */
  issuedAt: Date | null
  data: InvoiceData
  workshop: WorkshopInfo
  invoiceSettings: InvoiceSettingsProps
  serviceType: 'automotive' | 'marine'
  taxLabel?: string
  template: TemplateConfig
  layoutConfig: InvoiceLayoutConfig
  logoDataUri?: string
  paymentSummary?: PaymentSummary
  /** The look in the shape a snapshot stores. */
  designSource: DesignSource
  /** What the print labels derive from: the frozen service type and tax label. */
  labelSettings: Record<string, string>
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

async function loadLogoDataUri(logoPath: string): Promise<string | undefined> {
  if (!logoPath) return undefined
  try {
    const buffer = await readFile(resolveUploadPath(logoPath))
    const ext = logoPath.split('.').pop()?.toLowerCase() || 'png'
    return `data:${MIME_BY_EXT[ext] || 'image/png'};base64,${buffer.toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * The design a draft prints with: the invoice's own choice, then the
 * customer's, then whatever the settings describe. A choice that points at
 * a design of another workshop or of the wrong document type is ignored,
 * not trusted.
 */
async function resolveLiveDesign(
  organizationId: string,
  settingsMap: Record<string, string>,
  designId: string | null,
  customerDesignId: string | null | undefined
): Promise<DesignSource> {
  for (const id of [designId, customerDesignId]) {
    if (!id) continue
    const row = await db.documentDesign.findFirst({
      where: { id, organizationId, documentType: 'invoice' },
      select: { layout: true, template: true },
    })
    const source = row ? designSourceFromStored(row.layout, row.template) : null
    if (source) return source
  }
  return designSourceFromSettings(settingsMap, 'invoice')
}

function liveInvoiceSettings(settingsMap: Record<string, string>): InvoiceSettingsProps {
  return {
    bankAccount: settingsMap['invoice.bankAccount'] || '',
    orgNumber: settingsMap['invoice.orgNumber'] || '',
    paymentTerms: settingsMap['invoice.paymentTerms'] || '',
    footerNote: settingsMap['invoice.footerNote'] || '',
    showBankAccount: settingsMap['invoice.showBankAccount'] === 'true',
    showOrgNumber: settingsMap['invoice.showOrgNumber'] === 'true',
    dueDays: Number(settingsMap['invoice.dueDays']) || 0,
    currencyCode: settingsMap['workshop.currencyCode'] || 'USD',
    currencyFormat: settingsMap['workshop.currencyFormat'] === 'code' ? 'code' : 'symbol',
    unitSystem: settingsMap['workshop.unitSystem'] || 'imperial',
    dateFormat: settingsMap['workshop.dateFormat'] || undefined,
    timezone: settingsMap['workshop.timezone'] || undefined,
  }
}

function paymentSummaryOf(
  record: InvoiceRecordForPrint,
  dateFormat: string | undefined,
  timezone: string | undefined
): PaymentSummary | undefined {
  if (record.payments.length === 0 && !record.manuallyPaid) return undefined
  const paidFromPayments = record.payments.reduce((sum, p) => sum + p.amount, 0)
  const effectiveTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
  return {
    totalPaid: record.manuallyPaid ? effectiveTotal : paidFromPayments,
    payments: record.payments.map((p) => ({
      amount: p.amount,
      date: formatDateForPdf(p.date, dateFormat, timezone),
      method: p.method,
    })),
  }
}

type Party = NonNullable<InvoiceData['customer']>

function partyOf(
  row:
    | {
        name: string
        email?: string | null
        phone?: string | null
        address?: string | null
        company?: string | null
        taxId?: string | null
        customerNumber?: string | null
      }
    | null
    | undefined
): Party | null {
  if (!row) return null
  return {
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    company: row.company ?? null,
    taxId: row.taxId ?? null,
    customerNumber: row.customerNumber ?? null,
  }
}

export async function assembleInvoicePrint(
  recordId: string,
  options: AssembleOptions = {}
): Promise<InvoicePrintAssembly | null> {
  const mode = options.mode ?? 'auto'
  const record = await loadRecord(recordId)
  if (!record?.organizationId) return null
  const organizationId = record.organizationId

  const [settings, org] = await Promise.all([
    db.appSetting.findMany({ where: { organizationId }, select: { key: true, value: true } }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, portalSlug: true },
    }),
  ])
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const frozen: IssuedInvoiceData | null =
    mode === 'auto' && rendersFromIssue(record) ? readIssuedInvoiceData(record.issuedData) : null

  if (frozen) return assembleFrozen(record, organizationId, org, settingsMap, frozen)
  return assembleLive(record, organizationId, org, settingsMap)
}

async function assembleLive(
  record: InvoiceRecordForPrint,
  organizationId: string,
  org: InvoicePrintAssembly['org'],
  settingsMap: Record<string, string>
): Promise<InvoicePrintAssembly> {
  const customerRow = record.customer ?? record.vehicle?.customer ?? null
  const [findings, customFields, designSource] = await Promise.all([
    db.vehicleFinding.findMany({
      where: { serviceRecordId: record.id, status: { not: 'resolved' } },
      select: { description: true, severity: true, notes: true },
      orderBy: { createdAt: 'desc' },
    }),
    getCustomFieldsForPrint(organizationId, record.id, 'service_record'),
    resolveLiveDesign(organizationId, settingsMap, record.designId, customerRow?.invoiceDesignId),
  ])

  const logoPath =
    designSource.template.logoUrl?.trim() || settingsMap[SETTING_KEYS.COMPANY_LOGO]?.trim() || ''
  const logoDataUri = await loadLogoDataUri(logoPath)

  const invoiceSettings = liveInvoiceSettings(settingsMap)
  const workshop: WorkshopInfo = {
    name: org?.name || '',
    address: settingsMap['workshop.address'] || '',
    phone: settingsMap['workshop.phone'] || '',
    email: settingsMap['workshop.email'] || '',
    slogan: settingsMap['workshop.slogan'] || undefined,
  }
  const serviceType = settingsMap['workshop.serviceType'] === 'marine' ? 'marine' : 'automotive'
  const taxLabel = settingsMap['workshop.taxLabel']?.trim() || undefined
  const template = templateConfigFromSource(designSource)

  const data: InvoiceData = {
    ...record,
    customer: partyOf(record.customer),
    vehicle: record.vehicle
      ? { ...record.vehicle, customer: partyOf(record.vehicle.customer) }
      : null,
    customFields,
    findings,
  }

  return {
    record,
    organizationId,
    org,
    settingsMap,
    issuedAt: null,
    data,
    workshop,
    invoiceSettings,
    serviceType,
    taxLabel,
    template,
    layoutConfig: template.layoutConfig!,
    logoDataUri,
    paymentSummary: paymentSummaryOf(record, invoiceSettings.dateFormat, invoiceSettings.timezone),
    designSource,
    labelSettings: { 'workshop.serviceType': serviceType, 'workshop.taxLabel': taxLabel ?? '' },
  }
}

function assembleFrozen(
  record: InvoiceRecordForPrint,
  organizationId: string,
  org: InvoicePrintAssembly['org'],
  settingsMap: Record<string, string>,
  frozen: IssuedInvoiceData
): InvoicePrintAssembly {
  const snapshot = record.issuedDesignSnapshot
  // A snapshot that cannot be read falls back to the live look rather than
  // to nothing: the words on the sheet are still the frozen ones.
  const designSource =
    (snapshot && designSourceFromStored(snapshot.layout, snapshot.template)) ||
    designSourceFromSettings(settingsMap, 'invoice')
  const template = templateConfigFromSource(designSource)
  const logoDataUri = record.issuedLogoSnapshot
    ? assetDataUri(record.issuedLogoSnapshot)
    : undefined

  const invoiceSettings: InvoiceSettingsProps = {
    ...frozen.invoiceSettings,
    currencyCode: frozen.invoiceSettings.currencyCode || 'USD',
    currencyFormat: frozen.invoiceSettings.currencyFormat || 'symbol',
  }
  const serviceType = frozen.serviceType === 'marine' ? 'marine' : 'automotive'
  const taxLabel = frozen.taxLabel?.trim() || undefined
  const customer = frozen.customer ? partyOf(frozen.customer) : null
  const technicianName = frozen.technicianName ?? null

  const data: InvoiceData = {
    ...record,
    techName: technicianName ?? record.techName,
    technician: technicianName ? { name: technicianName } : null,
    customer,
    vehicle: frozen.vehicle
      ? {
          make: frozen.vehicle.make,
          model: frozen.vehicle.model,
          year: frozen.vehicle.year,
          vin: frozen.vehicle.vin ?? null,
          licensePlate: frozen.vehicle.licensePlate ?? null,
          mileage: frozen.vehicle.mileage ?? record.vehicle?.mileage ?? 0,
          customer: null,
        }
      : null,
    customFields: frozen.customFields ?? [],
    findings: (frozen.findings ?? []).map((f) => ({ ...f, notes: f.notes ?? null })),
  }

  return {
    record,
    organizationId,
    org,
    settingsMap,
    issuedAt: record.issuedAt,
    data,
    workshop: { ...frozen.workshop, slogan: frozen.workshop.slogan || undefined },
    invoiceSettings,
    serviceType,
    taxLabel,
    template,
    layoutConfig: template.layoutConfig!,
    logoDataUri,
    paymentSummary: paymentSummaryOf(record, invoiceSettings.dateFormat, invoiceSettings.timezone),
    designSource,
    labelSettings: { 'workshop.serviceType': serviceType, 'workshop.taxLabel': taxLabel ?? '' },
  }
}

/** The document's number as the file and the subject line spell it. */
export function invoiceNumberOf(record: { invoiceNumber: string | null; id: string }): string {
  return record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`
}
