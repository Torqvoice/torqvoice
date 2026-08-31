import { z } from 'zod'
import { db } from '@/lib/db'
import { calculateTotals } from '@/lib/tax'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { roundMoney } from '@/features/inventory/Lib/partPricing'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { assertInvoiceEditable } from '@/lib/document-lock.server'

/**
 * Adds a line of work to the job.
 *
 * The other half of what a technician has to record. Parts could already be
 * booked from the bay; the labour that fitted them could not, so a job came
 * back to the office with the components and no account of the work.
 *
 * The rate comes from the workshop's settings, never from the client. A phone
 * naming its own hourly rate would put the shop's pricing on the far side of a
 * network boundary, where a modified client could change it.
 */
const bodySchema = z.object({
  /**
   * Optional, because forcing a technician to describe work the job already
   * names is a keyboard between them and clocking off. Falls back to the job's
   * own title below, so the line still reads as something on an invoice.
   */
  description: z.string().max(500).optional(),
  hours: z.number().positive().max(1000),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const { description, hours } = bodySchema.parse(await request.json())

      // Labour is money on the invoice, so a locked job refuses it here too.
      await assertInvoiceEditable(id, ctx.organizationId)

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: {
          id: true,
          title: true,
          taxRate: true,
          taxInclusive: true,
          discountType: true,
          discountValue: true,
        },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const rateSetting = await db.appSetting.findFirst({
        where: { organizationId: ctx.organizationId, key: SETTING_KEYS.DEFAULT_LABOR_RATE },
        select: { value: true },
      })
      const rate = Number(rateSetting?.value ?? 0)
      // A shop that has never set a rate gets a line at zero rather than a
      // refusal. The work still happened, and the office can price it.
      const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0

      const line = await db.$transaction(async (tx) => {
        const created = await tx.serviceLabor.create({
          data: {
            description: description?.trim() || job.title,
            hours,
            rate: safeRate,
            total: roundMoney(safeRate * hours),
            pricingType: 'hourly',
            serviceRecordId: job.id,
          },
          select: { id: true, description: true, hours: true, rate: true, total: true },
        })

        // Same recalculation the parts path does, in the same transaction, so
        // the job's totals can never disagree with its lines.
        const [partsAgg, laborAgg] = await Promise.all([
          tx.servicePart.aggregate({ where: { serviceRecordId: job.id }, _sum: { total: true } }),
          tx.serviceLabor.aggregate({ where: { serviceRecordId: job.id }, _sum: { total: true } }),
        ])

        const subtotal = (partsAgg._sum.total || 0) + (laborAgg._sum.total || 0)
        const discountAmount =
          job.discountType === 'percentage'
            ? subtotal * ((job.discountValue ?? 0) / 100)
            : job.discountType === 'fixed'
              ? Math.min(job.discountValue ?? 0, subtotal)
              : 0
        const { taxAmount, totalAmount } = calculateTotals({
          subtotal,
          discountAmount,
          taxRate: job.taxRate,
          taxInclusive: job.taxInclusive,
        })

        await tx.serviceRecord.update({
          where: { id: job.id },
          data: { subtotal, taxAmount, totalAmount },
        })

        return created
      })

      return apiOk({ labor: line }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
