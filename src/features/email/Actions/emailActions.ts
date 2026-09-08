'use server'

import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { withAuth } from '@/lib/with-auth'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import React from 'react'
import { readFile } from 'fs/promises'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { QuotePDF } from '@/features/quotes/Components/QuotePDF'
import { InvoicePDF } from '@/features/vehicles/Components/InvoicePDF'
import { InspectionPDF } from '@/features/inspections/Components/InspectionPDF'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { markInvoiceSent, markQuoteSent } from '@/lib/document-lock.server'
import {
  mergeWithDefaults,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { requireFeature } from '@/lib/features'
import { demoGuard } from '@/lib/demo'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { assembleInvoicePrint, invoiceNumberOf } from '@/features/invoices/Lib/assembleInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getAppBaseUrl } from '@/lib/app-url'
import { randomUUID } from 'crypto'
import { buildDocumentEmailHtml, resolveAttachPdf } from '@/features/email/Lib/documentEmail'

async function getWorkshopSettings(organizationId: string) {
  const [settings, org] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            'workshop.address',
            'workshop.phone',
            'workshop.email',
            'workshop.slogan',
            'workshop.logo',
            'invoice.logo',
            'quote.logo',
            'workshop.currencyCode',
            'workshop.currencyFormat',
            'workshop.emailFromName',
            'workshop.emailEnabled',
            'invoice.primaryColor',
            'invoice.backgroundColor',
            'invoice.textColor',
            'invoice.companyTextColor',
            'invoice.frameBorderColor',
            'invoice.frameShadow',
            'invoice.frameRadius',
            'invoice.frameSide',
            'invoice.fontFamily',
            'invoice.showLogo',
            'invoice.showCompanyName',
            'invoice.headerStyle',
            'invoice.logoSize',
            // The saved arrangements, so an emailed sheet is the sheet the
            // workshop designed rather than the default one.
            'invoice.layoutConfig',
            'quote.layoutConfig',
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
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
  ])
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  map['workshop.name'] = org?.name || ''
  return map
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

export async function sendQuoteEmail(input: {
  quoteId: string
  recipientEmail: string
  message?: string
  /** Send the PDF, or the share link instead. Unset follows the setting. */
  attachPdf?: boolean
}) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'smtp')

      const { quoteId, recipientEmail, message } = input

      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        include: {
          partItems: true,
          laborItems: true,
          customer: {
            select: { name: true, email: true, phone: true, address: true, company: true },
          },
          vehicle: {
            select: { make: true, model: true, year: true, vin: true, licensePlate: true },
          },
        },
      })
      if (!quote) throw new Error('Quote not found')

      const settings = await getWorkshopSettings(organizationId)
      if (settings['workshop.emailEnabled'] === 'false') {
        throw new Error('Email sending is disabled. Enable it in Settings.')
      }
      const attachPdf = resolveAttachPdf(settings, input.attachPdf)

      const logoDataUri = await loadLogoDataUri(documentLogoPath(settings, 'quote'))
      const currencyCode = settings['workshop.currencyCode'] || 'USD'
      const currencyFormat: 'symbol' | 'code' =
        settings['workshop.currencyFormat'] === 'code' ? 'code' : 'symbol'
      const fromName = settings['workshop.emailFromName'] || settings['workshop.name'] || 'Workshop'

      const pick = (key: string) => settings[`quote.${key}`] || settings[`invoice.${key}`]
      const template = {
        primaryColor: pick('primaryColor') || '#d97706',
        backgroundColor: pick('backgroundColor') || undefined,
        textColor: pick('textColor') || undefined,
        companyTextColor: pick('companyTextColor') || undefined,
        frameBorderColor: pick('frameBorderColor') || undefined,
        frameShadow: pick('frameShadow'),
        frameRadius: Number(pick('frameRadius')) || 0,
        frameSide: (pick('frameSide') === 'right' ? 'right' : 'left') as 'left' | 'right',
        fontFamily: pick('fontFamily') || 'Helvetica',
        showLogo: settings['invoice.showLogo'] !== 'false',
        showCompanyName: settings['invoice.showCompanyName'] !== 'false',
        headerStyle: pick('headerStyle') || 'standard',
        logoSize: Number(pick('logoSize')) || undefined,
      }
      let quoteLayoutConfig: InvoiceLayoutConfig | undefined
      try {
        quoteLayoutConfig = settings['quote.layoutConfig']
          ? mergeWithDefaults(JSON.parse(settings['quote.layoutConfig']))
          : undefined
      } catch {
        quoteLayoutConfig = undefined
      }

      let pdfBuffer: Buffer | null = null
      if (attachPdf) {
        const element = React.createElement(QuotePDF, {
          data: quote,
          workshop: {
            name: settings['workshop.name'] || '',
            address: settings['workshop.address'] || '',
            phone: settings['workshop.phone'] || '',
            email: settings['workshop.email'] || '',
            slogan: settings['workshop.slogan'] || undefined,
          },
          currencyCode,
          currencyFormat,
          logoDataUri,
          template,
          layoutConfig: quoteLayoutConfig,
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
        pdfBuffer = Buffer.from(await renderToBuffer(element))
      }
      const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`

      // The quote mail carried no link at all before, which left a link-only
      // send with nothing in it. One is minted for a quote never shared.
      const token = quote.publicToken ?? (attachPdf ? null : randomUUID())
      if (token && token !== quote.publicToken) {
        await db.quote.update({
          where: { id: quoteId },
          data: { publicToken: token, sharedAt: new Date() },
        })
      }
      const publicLink = token ? `${getAppBaseUrl()}/share/quote/${organizationId}/${token}` : null

      const from = await getOrgFromAddress(organizationId)

      await sendOrgMail(organizationId, {
        from,
        to: recipientEmail,
        subject: `Quote ${quoteNum} - ${quote.title}`,
        html: buildDocumentEmailHtml({
          heading: `Quote ${quoteNum}`,
          subject: 'quote',
          link: publicLink,
          linkLabel: 'View Quote Online',
          attached: attachPdf,
          message,
          fromName,
          phone: settings['workshop.phone'],
        }),
        attachments: pdfBuffer
          ? [
              {
                filename: `${quoteNum}.pdf`,
                content: pdfBuffer,
              },
            ]
          : undefined,
      })

      // Stamps sentAt and moves a draft to "sent" (accepted and converted
      // quotes keep their status).
      await markQuoteSent(quoteId, organizationId)

      return { sent: true, quoteId, recipientEmail }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'email.sendQuote',
        entity: 'Quote',
        entityId: result.quoteId,
        details: { key: 'email_sendQuote', params: { recipient: result.recipientEmail } },
        metadata: { quoteId: result.quoteId, recipientEmail: result.recipientEmail },
      }),
    }
  )
}

export async function sendNotificationEmail(input: {
  recipientEmail: string
  subject: string
  body: string
}) {
  return withAuth(async ({ organizationId }) => {
    demoGuard()
    await requireFeature(organizationId, 'smtp')

    const settings = await getWorkshopSettings(organizationId)
    if (settings['workshop.emailEnabled'] === 'false') {
      throw new Error('Email sending is disabled. Enable it in Settings.')
    }

    const fromName = settings['workshop.emailFromName'] || settings['workshop.name'] || 'Workshop'
    const from = await getOrgFromAddress(organizationId)

    await sendOrgMail(organizationId, {
      from,
      to: input.recipientEmail,
      subject: input.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <p style="white-space: pre-line;">${input.body}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 14px;">
            ${fromName}${settings['workshop.phone'] ? ` · ${settings['workshop.phone']}` : ''}
          </p>
        </div>
      `,
    })

    return { sent: true }
  })
}

export async function sendInvoiceEmail(input: {
  serviceRecordId: string
  recipientEmail: string
  message?: string
  /** Send the PDF, or the share link instead. Unset follows the setting. */
  attachPdf?: boolean
}) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'smtp')

      const { serviceRecordId, recipientEmail, message } = input

      const owned = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: { id: true, publicToken: true },
      })
      if (!owned) throw new Error('Service record not found')

      const settings = await getWorkshopSettings(organizationId)
      if (settings['workshop.emailEnabled'] === 'false') {
        throw new Error('Email sending is disabled. Enable it in Settings.')
      }
      const attachPdf = resolveAttachPdf(settings, input.attachPdf)

      // Issued before it is rendered, so the copy that goes out and the copy
      // the workshop can print in five years are the same one.
      await issueInvoice(serviceRecordId, organizationId, 'sent')
      const assembly = await assembleInvoicePrint(serviceRecordId)
      if (!assembly) throw new Error('Service record not found')
      const { record } = assembly

      const fromName = settings['workshop.emailFromName'] || settings['workshop.name'] || 'Workshop'

      let pdfBuffer: Buffer | null = null
      if (attachPdf) {
        const locale = await resolveCustomerLocale(organizationId, null)
        const labels = await loadPrintLabels(locale, assembly.labelSettings)
        const element = React.createElement(InvoicePDF, {
          data: assembly.data,
          workshop: assembly.workshop,
          invoiceSettings: assembly.invoiceSettings,
          paymentSummary: assembly.paymentSummary,
          logoDataUri: assembly.logoDataUri,
          template: assembly.template,
          labels,
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
        pdfBuffer = Buffer.from(await renderToBuffer(element))
      }
      const invoiceNum = invoiceNumberOf(record)

      // Without the PDF the link is the whole mail, so one is minted here for
      // a document that has never been shared. sharedAt goes with it, the way
      // the share dialog sets it; sentAt is markInvoiceSent's job below.
      const token = owned.publicToken ?? (attachPdf ? null : randomUUID())
      if (token && token !== owned.publicToken) {
        await db.serviceRecord.update({
          where: { id: serviceRecordId },
          data: { publicToken: token, sharedAt: new Date() },
        })
      }
      const publicLink = token
        ? `${getAppBaseUrl()}/share/invoice/${organizationId}/${token}`
        : null

      const from = await getOrgFromAddress(organizationId)

      await sendOrgMail(organizationId, {
        from,
        to: recipientEmail,
        subject: `Invoice ${invoiceNum} - ${record.title}`,
        html: buildDocumentEmailHtml({
          heading: `Invoice ${invoiceNum}`,
          subject: 'invoice',
          link: publicLink,
          linkLabel: 'View Invoice Online',
          attached: attachPdf,
          message,
          fromName,
          phone: settings['workshop.phone'],
        }),
        attachments: pdfBuffer
          ? [
              {
                filename: `${invoiceNum}.pdf`,
                content: pdfBuffer,
              },
            ]
          : undefined,
      })

      await markInvoiceSent(serviceRecordId, organizationId, { alreadyIssued: true })

      return { sent: true, serviceRecordId, recipientEmail }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'email.sendInvoice',
        entity: 'ServiceRecord',
        entityId: result.serviceRecordId,
        details: { key: 'email_sendInvoice', params: { recipient: result.recipientEmail } },
        metadata: {
          serviceRecordId: result.serviceRecordId,
          recipientEmail: result.recipientEmail,
        },
      }),
    }
  )
}

export async function sendInspectionEmail(input: {
  inspectionId: string
  recipientEmail: string
  message?: string
  /** Send the PDF, or the share link instead. Unset follows the setting. */
  attachPdf?: boolean
}) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'smtp')

      const { inspectionId, recipientEmail, message } = input

      const [inspection, org] = await Promise.all([
        db.inspection.findFirst({
          where: { id: inspectionId, organizationId },
          include: {
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
                vin: true,
                licensePlate: true,
                mileage: true,
                customer: { select: { name: true, email: true, phone: true } },
              },
            },
            template: { select: { name: true } },
            items: { orderBy: { sortOrder: 'asc' } },
          },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
      ])
      if (!inspection) throw new Error('Inspection not found')

      const settings = await getWorkshopSettings(organizationId)
      if (settings['workshop.emailEnabled'] === 'false') {
        throw new Error('Email sending is disabled. Enable it in Settings.')
      }
      const attachPdf = resolveAttachPdf(settings, input.attachPdf)

      const logoDataUri = await loadLogoDataUri(settings['workshop.logo'])
      const fromName = settings['workshop.emailFromName'] || settings['workshop.name'] || 'Workshop'

      const template = {
        primaryColor: settings['invoice.primaryColor'] || '#d97706',
        backgroundColor: settings['invoice.backgroundColor'] || undefined,
        textColor: settings['invoice.textColor'] || undefined,
        companyTextColor: settings['invoice.companyTextColor'] || undefined,
        frameBorderColor: settings['invoice.frameBorderColor'] || undefined,
        frameShadow: settings['invoice.frameShadow'],
        frameSide: (settings['invoice.frameSide'] === 'right' ? 'right' : 'left') as
          | 'left'
          | 'right',
        fontFamily: settings['invoice.fontFamily'] || 'Helvetica',
        showLogo: settings['invoice.showLogo'] !== 'false',
        showCompanyName: settings['invoice.showCompanyName'] !== 'false',
        headerStyle: settings['invoice.headerStyle'] || 'standard',
      }

      const vehicleName = `${inspection.vehicle.year} ${inspection.vehicle.make} ${inspection.vehicle.model}`
      const fileName = `Inspection-${vehicleName}.pdf`

      let pdfBuffer: Buffer | null = null
      if (attachPdf) {
        const features = await getFeatures(organizationId)
        let torqvoiceLogoDataUri: string | undefined
        if (!features.brandingRemoved) {
          torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri()
        }

        const element = React.createElement(InspectionPDF, {
          data: inspection,
          workshop: {
            name: org?.name || '',
            address: settings['workshop.address'] || '',
            phone: settings['workshop.phone'] || '',
            email: settings['workshop.email'] || '',
          },
          logoDataUri,
          torqvoiceLogoDataUri,
          dateFormat: settings['workshop.dateFormat'] || undefined,
          timezone: settings['workshop.timezone'] || undefined,
          template,
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
        pdfBuffer = Buffer.from(await renderToBuffer(element))
      }

      // Without the PDF the link is the whole mail, so one is minted for an
      // inspection that has never been shared.
      const token = inspection.publicToken ?? (attachPdf ? null : randomUUID())
      if (token && token !== inspection.publicToken) {
        await db.inspection.update({
          where: { id: inspectionId },
          data: { publicToken: token },
        })
      }
      const publicLink = token
        ? `${getAppBaseUrl()}/share/inspection/${organizationId}/${token}`
        : null

      const from = await getOrgFromAddress(organizationId)

      await sendOrgMail(organizationId, {
        from,
        to: recipientEmail,
        subject: `Vehicle Inspection - ${vehicleName}`,
        html: buildDocumentEmailHtml({
          heading: 'Vehicle Inspection Report',
          subject: `inspection report for your ${vehicleName}`,
          link: publicLink,
          linkLabel: 'View Inspection Online',
          attached: attachPdf,
          message,
          fromName,
          phone: settings['workshop.phone'],
        }),
        attachments: pdfBuffer
          ? [
              {
                filename: fileName,
                content: pdfBuffer,
              },
            ]
          : undefined,
      })

      return { sent: true, inspectionId, recipientEmail }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'email.sendInspection',
        entity: 'Inspection',
        entityId: result.inspectionId,
        details: { key: 'email_sendInspection', params: { recipient: result.recipientEmail } },
        metadata: { inspectionId: result.inspectionId, recipientEmail: result.recipientEmail },
      }),
    }
  )
}
