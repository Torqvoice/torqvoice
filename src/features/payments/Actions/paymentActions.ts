'use server'

import { toSafeDate } from '@/lib/invoice-utils'
import { db } from '@/lib/db'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createPaymentSchema } from '../Schema/paymentSchema'
import { revalidatePath } from 'next/cache'
import { getDocumentLockSettings } from '@/lib/document-lock.server'
import { DocumentLockedError, invoiceLockState } from '@/lib/document-lock'

export async function createPayment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createPaymentSchema.parse(input)

      // Verify ownership: serviceRecord -> vehicle -> organizationId
      const serviceRecord = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, organizationId },
        select: { id: true, vehicleId: true },
      })
      if (!serviceRecord) throw new Error('Service record not found')

      const payment = await db.payment.create({
        data: {
          serviceRecordId: data.serviceRecordId,
          amount: data.amount,
          date: toSafeDate(data.date) ?? new Date(),
          method: data.method,
          note: data.note || null,
        },
      })
      // Money against it makes the invoice the customer's document, even one
      // handed over on paper and never sent through the app.
      await issueInvoice(data.serviceRecordId, organizationId, 'paid')

      revalidatePath(
        serviceRecord.vehicleId
          ? `/vehicles/${serviceRecord.vehicleId}/service/${data.serviceRecordId}`
          : `/sales/${data.serviceRecordId}`
      )
      return {
        ...payment,
        serviceRecordId: data.serviceRecordId,
        amount: data.amount,
        method: data.method,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.BILLING },
      ],
      audit: ({ result }) => ({
        action: 'payment.create',
        entity: 'Payment',
        entityId: result.id,
        details: {
          key: 'payment_create',
          params: { amount: result.amount, serviceRecordId: result.serviceRecordId },
        },
        metadata: {
          paymentId: result.id,
          serviceRecordId: result.serviceRecordId,
          amount: result.amount,
          method: result.method,
        },
      }),
    }
  )
}

export async function deletePayment(paymentId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const payment = await db.payment.findFirst({
        where: { id: paymentId, serviceRecord: { organizationId } },
        include: {
          serviceRecord: {
            select: {
              vehicleId: true,
              id: true,
              sentAt: true,
              manuallyPaid: true,
              totalAmount: true,
              cost: true,
              editUnlockedAt: true,
              payments: { select: { id: true, amount: true } },
            },
          },
        },
      })
      if (!payment) throw new Error('Payment not found')

      // Recording payments is always allowed, but removing the payment that
      // settled a locked invoice would release the lock — the admin-only
      // unlock in disguise. Deleting a partial payment stays open to everyone,
      // since it never changes the lock.
      const settings = await getDocumentLockSettings(organizationId)
      const before = invoiceLockState(payment.serviceRecord, settings)
      const after = invoiceLockState(
        {
          ...payment.serviceRecord,
          payments: payment.serviceRecord.payments.filter((p) => p.id !== paymentId),
        },
        settings
      )
      if (before.locked && !after.locked && before.reason) {
        throw new DocumentLockedError(before.reason)
      }

      await db.payment.delete({ where: { id: paymentId } })

      const { vehicleId, id: serviceId } = payment.serviceRecord
      revalidatePath(
        vehicleId ? `/vehicles/${vehicleId}/service/${serviceId}` : `/sales/${serviceId}`
      )
      return { deleted: true, paymentId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.BILLING },
      ],
      audit: ({ result }) => ({
        action: 'payment.delete',
        entity: 'Payment',
        entityId: result.paymentId,
        details: { key: 'payment_delete', params: { id: result.paymentId } },
        metadata: { paymentId: result.paymentId },
      }),
    }
  )
}
