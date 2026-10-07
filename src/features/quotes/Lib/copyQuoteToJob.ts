import { copyFile, mkdir } from 'fs/promises'
import path from 'path'
import type { QuoteAttachment, QuoteLabor, QuotePart } from '@/generated/prisma/client'
import type { TxClient } from '@/lib/db'
import { uploadsRoot } from '@/lib/upload-root'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'

/**
 * What a quote puts on a job, whether the job is raised from it or was
 * already there. One copy of each step, so a quote added to an open work
 * order moves stock and carries files exactly as a fresh conversion does.
 */

/** The job the quote's lines are written to. */
export interface QuoteCopyTarget {
  id: string
  title: string
  invoiceNumber: string | null
}

/**
 * Writes the quote's included parts onto the job and takes them out of stock.
 * Lines the customer left out of the total stay on the quote.
 */
export async function copyQuotePartsToJob(
  tx: TxClient,
  args: {
    organizationId: string
    userId: string
    quote: { id: string; quoteNumber: string | null }
    partItems: QuotePart[]
    target: QuoteCopyTarget
  }
): Promise<QuotePart[]> {
  const { organizationId, userId, quote, target } = args
  const includedParts = args.partItems.filter((p) => !p.excluded)
  if (includedParts.length === 0) return includedParts

  await tx.servicePart.createMany({
    data: includedParts.map((p) => ({
      partNumber: p.partNumber,
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      unitCost: p.unitCost,
      markupPercent: p.markupPercent,
      unitPrice: p.unitPrice,
      total: p.total,
      // Preserve the stock link so the job — and any later edit or
      // deletion of it — reconciles against the right inventory item.
      inventoryPartId: p.inventoryPartId,
      serviceRecordId: target.id,
    })),
  })

  // The quote itself never moved stock (it is only an estimate). The
  // conversion is the point of consumption, so deduct here — exactly
  // once, inside the same transaction that writes the lines.
  await reconcileInventoryForParts(tx, organizationId, [], includedParts, {
    reason: 'quote_conversion',
    userId,
    serviceRecordId: target.id,
    serviceRecordLabel: target.invoiceNumber || target.title,
    note: `Converted from quote ${quote.quoteNumber ?? quote.id}`,
  })

  return includedParts
}

/** Writes the given quote labor lines onto the job. */
export async function copyQuoteLaborToJob(
  tx: TxClient,
  serviceRecordId: string,
  laborItems: QuoteLabor[]
): Promise<void> {
  if (laborItems.length === 0) return
  await tx.serviceLabor.createMany({
    data: laborItems.map((l) => ({
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      total: l.total,
      pricingType: l.pricingType || 'hourly',
      serviceRecordId,
    })),
  })
}

/**
 * Copies the quote's files next to the job's own and lists them on it. A file
 * that cannot be copied is skipped with a warning rather than failing the
 * conversion over a picture.
 */
export async function copyQuoteAttachmentsToJob(
  tx: TxClient,
  organizationId: string,
  serviceRecordId: string,
  attachments: QuoteAttachment[]
): Promise<void> {
  if (attachments.length === 0) return

  const quotesDir = path.join(uploadsRoot(), organizationId, 'quotes')
  // Where every other upload goes. This used to be a fixed
  // `data/uploads`, so with DATA_ROOT set the copies landed where the
  // file route never looks and the job showed broken images.
  const servicesDir = path.join(uploadsRoot(), organizationId, 'services')
  await mkdir(servicesDir, { recursive: true })

  for (const att of attachments) {
    try {
      // Extract filename from URL and build paths; only a plain name.
      const filename = att.fileUrl.split('/').pop() ?? ''
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) || filename.includes('..')) {
        throw new Error('not a stored file name')
      }
      const srcPath = path.join(quotesDir, filename)
      const destPath = path.join(servicesDir, filename)
      await copyFile(srcPath, destPath)

      const newUrl = att.fileUrl.replace('/quotes/', '/services/')
      await tx.serviceAttachment.create({
        data: {
          fileName: att.fileName,
          fileUrl: newUrl,
          fileType: att.fileType,
          fileSize: att.fileSize,
          category: att.category === 'document' ? 'document' : 'image',
          description: att.description,
          includeInInvoice: att.includeInInvoice,
          serviceRecordId,
        },
      })
    } catch (err) {
      console.warn(`[convertQuote] Failed to copy attachment "${att.fileName}":`, err)
    }
  }
}
