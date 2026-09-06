import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { cookies } from 'next/headers'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { InvoicePDF } from '@/features/vehicles/Components/InvoicePDF'
import React from 'react'
import { readFile } from 'fs/promises'
import { PDFDocument } from 'pdf-lib'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { markInvoiceIssued } from '@/features/onboarding/Lib/markInvoiceIssued'
import { getOrgTelegramBotUsername } from '@/lib/telegram'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { assembleInvoicePrint, invoiceNumberOf } from '@/features/invoices/Lib/assembleInvoicePrint'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext()

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const owned = await db.serviceRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!owned) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // What the sheet says: an issued invoice from its snapshots, a draft
    // from live rows. Everything below adds what is not part of the document.
    const assembly = await assembleInvoicePrint(owned.id)
    if (!assembly) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }
    const { record, settingsMap, org, layoutConfig } = assembly

    // Getting-started checklist: a downloaded invoice leaves no other trace
    // in the data, so record it here. Best-effort, never blocks the PDF.
    void markInvoiceIssued(ctx.organizationId, ctx.userId, record.id)

    // Load locale-based PDF translations
    const cookieStore = await cookies()
    const locale = cookieStore.get('locale')?.value || 'en'
    const labels = await loadPrintLabels(locale, assembly.labelSettings)

    // Load image attachments as base64 data URIs for PDF embedding
    const imageAttachments: { fileName: string; dataUri: string; description?: string }[] = []
    const otherAttachments: { fileName: string; fileType: string }[] = []
    const pdfAttachments: { fileName: string; buffer: Buffer }[] = []

    // Only include attachments marked for invoice, then deduplicate by fileName
    const seenNames = new Set<string>()
    const uniqueAttachments = record.attachments
      .filter((att) => att.includeInInvoice !== false)
      .filter((att) => {
        if (seenNames.has(att.fileName)) return false
        seenNames.add(att.fileName)
        return true
      })

    for (const att of uniqueAttachments) {
      if (att.fileType.startsWith('image/')) {
        try {
          const filePath = resolveUploadPath(att.fileUrl)
          const buffer = await readFile(filePath)
          const base64 = buffer.toString('base64')
          const mimeType = att.fileType
          imageAttachments.push({
            fileName: att.fileName,
            dataUri: `data:${mimeType};base64,${base64}`,
            description: att.description || undefined,
          })
        } catch {
          otherAttachments.push({ fileName: att.fileName, fileType: att.fileType })
        }
      } else if (att.fileType === 'application/pdf') {
        try {
          const filePath = resolveUploadPath(att.fileUrl)
          const buffer = await readFile(filePath)
          pdfAttachments.push({ fileName: att.fileName, buffer })
        } catch {
          otherAttachments.push({ fileName: att.fileName, fileType: att.fileType })
        }
      } else {
        otherAttachments.push({ fileName: att.fileName, fileType: att.fileType })
      }
    }

    // Check if Torqvoice branding should be shown
    const features = await getFeatures(ctx.organizationId)
    let torqvoiceLogoDataUri: string | undefined
    if (!features.brandingRemoved) {
      torqvoiceLogoDataUri = await getTorqvoiceLogoDataUri()
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const portalSlug = org?.portalSlug
    const portalEnabled = settingsMap['portal.enabled'] === 'true'
    const portalUrl = portalEnabled
      ? `${appUrl}/portal/${portalSlug || ctx.organizationId}`
      : undefined

    // Generate Telegram QR if the telegram_qr section is visible in layout
    let telegramQrDataUri: string | undefined
    const telegramBotUsername = await getOrgTelegramBotUsername(ctx.organizationId)
    const telegramQrVisible = layoutConfig.sections.some((s) => s.id === 'telegram_qr' && s.visible)
    if (telegramBotUsername && telegramQrVisible) {
      const { generateQrDataUri } = await import('@/lib/qr')
      telegramQrDataUri = await generateQrDataUri(`https://t.me/${telegramBotUsername}`, 200)
    }

    const element = React.createElement(InvoicePDF, {
      data: assembly.data,
      workshop: assembly.workshop,
      invoiceSettings: assembly.invoiceSettings,
      paymentSummary: assembly.paymentSummary,
      imageAttachments,
      otherAttachments,
      pdfAttachmentNames: pdfAttachments.map((a) => a.fileName),
      logoDataUri: assembly.logoDataUri,
      template: assembly.template,
      torqvoiceLogoDataUri,
      portalUrl,
      telegramQrDataUri,
      telegramLabel: labels?.telegramConnect || 'Chat with us on Telegram',
      labels,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const invoiceBuffer = await renderToBuffer(element)

    const invoiceNum = invoiceNumberOf(record)

    // Merge attached PDF diagnostic reports into the invoice
    let finalBuffer: ArrayBuffer
    if (pdfAttachments.length > 0) {
      const mergedPdf = await PDFDocument.load(invoiceBuffer)
      for (const att of pdfAttachments) {
        try {
          const attachedPdf = await PDFDocument.load(att.buffer)
          const pages = await mergedPdf.copyPages(attachedPdf, attachedPdf.getPageIndices())
          for (const page of pages) {
            mergedPdf.addPage(page)
          }
        } catch {
          // Skip corrupted/unreadable PDFs silently
        }
      }
      const saved = await mergedPdf.save()
      finalBuffer = saved.buffer.slice(
        saved.byteOffset,
        saved.byteOffset + saved.byteLength
      ) as ArrayBuffer
    } else {
      finalBuffer = invoiceBuffer.buffer.slice(
        invoiceBuffer.byteOffset,
        invoiceBuffer.byteOffset + invoiceBuffer.byteLength
      ) as ArrayBuffer
    }

    return new NextResponse(finalBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceNum}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[PDF Generation] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
