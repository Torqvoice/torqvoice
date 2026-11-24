'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { auditDetails } from '@/lib/audit'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { notificationBus } from '@/lib/notification-bus'
import { invoiceWentOut } from '@/features/invoices/Lib/issuedInvoice'
import { refundableAmount } from '@/features/invoices/Lib/cancelInvoice'
import { CANCELLED, isCancelled, statusColumns } from '@/features/work-order-statuses/Lib/stages'

const cancelSchema = z.object({
  recordId: z.string().min(1),
  /** Money handed back as the invoice is cancelled, booked as a negative payment. */
  refund: z
    .object({
      amount: z.coerce.number().positive(),
      method: z.enum(['cash', 'card', 'transfer', 'other']).default('other'),
      note: z.string().max(500).optional(),
    })
    .nullable()
    .optional(),
})

/**
 * Cancels a job whose invoice went out, in place of deleting it.
 *
 * The job stays, with its invoice number, its lines and its frozen copy, and
 * its status becomes cancelled: the invoice, the share page, the PDF and the
 * customer's portal then say so, and it drops out of open work, of revenue
 * and of tax. A draft that never went out is refused here; it is deleted.
 *
 * Money already taken can be handed back in the same step, as a refund: a
 * negative payment dated today, the shape a refund from a ledger already
 * arrives in, so collected money nets to what was kept. Recording it needs
 * the right to record payments.
 *
 * Its audit event, service.cancel, is what the accounting connectors listen
 * for: each voids or reverses its copy where the ledger allows it.
 */
export async function cancelServiceRecord(input: unknown) {
  return withAuth(
    async (ctx) => {
      const { organizationId } = ctx
      const data = cancelSchema.parse(input)
      const record = await db.serviceRecord.findFirst({
        where: { id: data.recordId, organizationId },
        select: {
          id: true,
          title: true,
          status: true,
          vehicleId: true,
          invoiceNumber: true,
          issuedAt: true,
          sentAt: true,
          manuallyPaid: true,
          totalAmount: true,
          cost: true,
          payments: { select: { amount: true } },
          vehicle: {
            select: { id: true, make: true, model: true, year: true, licensePlate: true },
          },
        },
      })
      if (!record) throw new Error('Record not found')
      if (isCancelled(record.status)) throw new Error('This invoice is already cancelled')
      if (!invoiceWentOut(record)) {
        throw new Error('This invoice never went out. Delete the job instead.')
      }

      const refund = data.refund ?? null
      if (refund) {
        if (!ctx.isAdmin) {
          const membership = await getCachedMembership(ctx.userId)
          const allowed = hasPermission(membership?.customRole?.permissions ?? [], {
            action: PermissionAction.CREATE,
            subject: PermissionSubject.BILLING,
          })
          if (!allowed) throw new Error('You may not record payments, so no refund was recorded')
        }
        const most = refundableAmount(record)
        if (refund.amount > most + 0.005) {
          throw new Error(`A refund cannot be more than was paid (${most.toFixed(2)})`)
        }
      }

      const refundAmount = refund ? Math.round(refund.amount * 100) / 100 : 0
      await db.$transaction(async (tx) => {
        // Conditional on the status it was read with: two cancels at once
        // book one refund.
        const moved = await tx.serviceRecord.updateMany({
          where: { id: record.id, organizationId, status: { not: CANCELLED } },
          data: statusColumns(CANCELLED),
        })
        if (moved.count === 0) throw new Error('This invoice is already cancelled')
        if (refund) {
          await tx.payment.create({
            data: {
              serviceRecordId: record.id,
              amount: -refundAmount,
              date: new Date(),
              method: refund.method,
              note: refund.note?.trim() || null,
            },
          })
        }
      })

      notificationBus.emit('workboard', {
        type: 'job_status_changed',
        organizationId,
        serviceRecordId: record.id,
        status: CANCELLED,
        serviceRecord: {
          id: record.id,
          title: record.title,
          status: CANCELLED,
          vehicle: record.vehicle,
        },
      })

      revalidatePath('/')
      revalidatePath('/work-orders')
      revalidatePath('/billing')
      if (record.vehicleId) {
        revalidatePath(`/vehicles/${record.vehicleId}`)
        revalidatePath(`/vehicles/${record.vehicleId}/service/${record.id}`)
      } else {
        revalidatePath(`/sales/${record.id}`)
      }
      return {
        recordId: record.id,
        invoiceNumber: record.invoiceNumber,
        refunded: refundAmount,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.cancel',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        details:
          result.refunded > 0
            ? auditDetails('service_cancelRefund', {
                ref: result.invoiceNumber || result.recordId,
                amount: result.refunded,
              })
            : auditDetails('service_cancel', { ref: result.invoiceNumber || result.recordId }),
        metadata: {
          serviceRecordId: result.recordId,
          invoiceNumber: result.invoiceNumber,
          refunded: result.refunded,
        },
      }),
    }
  )
}
