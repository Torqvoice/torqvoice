'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { assertInvoiceEditable, assertQuoteEditable } from '@/lib/document-lock.server'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { taxableSubtotalOf } from '@/lib/taxable-lines'
import { withAuth } from '@/lib/with-auth'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { documentTotals, taxFieldsForNewDocument } from '../Lib/workshopTax'
import { loadWorkshopTaxSettings, workshopTaxOffer } from '../Lib/workshopTaxOffer'

const inputSchema = z.object({
  kind: z.enum(['workOrder', 'quote']),
  id: z.string().min(1),
})

/**
 * Moves one work order or quote onto the workshop's tax as it stands today:
 * the rate, the split into components when the workshop has one, and the
 * totals that follow.
 *
 * The offer is checked again here, since the page that made it may be old:
 * a document that has since been sent, finished or locked is refused.
 *
 * A document that carried no tax at all also has its lines put on the
 * workshop's rule for each kind (parts, labor, shop fee). Their flags were
 * never a choice anyone made while the document had no tax to charge. A
 * document moving from one rate to another keeps its lines as they are.
 */
export async function applyWorkshopTaxToDocument(input: unknown) {
  const { kind, id } = inputSchema.parse(input)
  return withAuth(
    async ({ organizationId }) => {
      if (kind === 'workOrder') await assertInvoiceEditable(id, organizationId)
      else await assertQuoteEditable(id, organizationId)

      const offer = await workshopTaxOffer(organizationId, kind, id)
      if (!offer) throw new Error('The workshop tax cannot be applied to this document')

      const tax = await loadWorkshopTaxSettings(organizationId)
      const fields = taxFieldsForNewDocument(tax)
      const taxData = {
        taxRate: fields.taxRate,
        taxComponents: fields.taxComponents ?? Prisma.DbNull,
      }
      const hadNoTax = offer.currentRate <= 0

      if (kind === 'workOrder') {
        await db.$transaction(async (tx) => {
          if (hadNoTax) {
            await tx.servicePart.updateMany({
              where: { serviceRecordId: id },
              data: { taxable: tax.applies.parts },
            })
            await tx.serviceLabor.updateMany({
              where: { serviceRecordId: id, pricingType: 'shopFee' },
              data: { taxable: tax.applies.shopFee },
            })
            await tx.serviceLabor.updateMany({
              where: { serviceRecordId: id, pricingType: { not: 'shopFee' } },
              data: { taxable: tax.applies.labor },
            })
          }
          await tx.serviceRecord.update({ where: { id }, data: taxData })
          // Re-totalled from the lines under the rate just written.
          await retotalServiceRecord(id, tx)
        })
        revalidatePath('/work-orders')
      } else {
        await db.$transaction(async (tx) => {
          if (hadNoTax) {
            await tx.quotePart.updateMany({
              where: { quoteId: id },
              data: { taxable: tax.applies.parts },
            })
            await tx.quoteLabor.updateMany({
              where: { quoteId: id, pricingType: 'shopFee' },
              data: { taxable: tax.applies.shopFee },
            })
            await tx.quoteLabor.updateMany({
              where: { quoteId: id, pricingType: { not: 'shopFee' } },
              data: { taxable: tax.applies.labor },
            })
          }
          const quote = await tx.quote.findUniqueOrThrow({
            where: { id },
            select: {
              subtotal: true,
              discountAmount: true,
              taxInclusive: true,
              partItems: { select: { total: true, taxable: true, excluded: true } },
              laborItems: {
                select: { total: true, taxable: true, excluded: true, pricingType: true },
              },
            },
          })
          // The lines the customer declined count toward nothing, as in the subtotal.
          const totals = documentTotals({
            subtotal: quote.subtotal,
            discountAmount: quote.discountAmount,
            taxRate: fields.taxRate,
            taxInclusive: quote.taxInclusive,
            taxComponents: fields.taxComponents,
            taxableSubtotal: taxableSubtotalOf(
              quote.partItems.filter((line) => !line.excluded),
              quote.laborItems.filter((line) => !line.excluded)
            ),
          })
          await tx.quote.update({
            where: { id },
            data: {
              taxRate: fields.taxRate,
              taxAmount: totals.taxAmount,
              totalAmount: totals.totalAmount,
              taxComponents: totals.taxComponents ?? Prisma.DbNull,
              taxableSubtotal: totals.taxableSubtotal,
            },
          })
        })
        revalidatePath('/quotes')
        revalidatePath(`/quotes/${id}`)
      }
      return { id, rate: offer.rate }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: kind === 'workOrder' ? PermissionSubject.SERVICES : PermissionSubject.QUOTES,
        },
      ],
    }
  )
}
