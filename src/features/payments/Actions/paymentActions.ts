'use server'

import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { db } from '@/lib/db'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createPaymentSchema } from '../Schema/paymentSchema'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { roundMoney } from '@/lib/money'
import { workshopMoneyFormatter } from '@/lib/workshop-currency'
import { paymentBalanceDue } from '../Lib/balanceDue'
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

      const date =
        toSafeWorkshopDate(data.date, await workshopTimeZone(organizationId)) ?? new Date()
      const amount = roundMoney(data.amount)

      // A payment taken at the desk may settle the balance, never pass it:
      // £1000 against £552.74 left the invoice reading "PAID IN FULL -£447.26".
      // The balance is read under the job's row lock, so two people taking the
      // last payment at once take turns instead of both getting through.
      // Money a provider has already taken (Stripe, Vipps, PayPal, Paystack)
      // and ledger syncs are booked by recordVendorPayment, never through here,
      // so a real payment is never refused for being more than was owed.
      const outcome = await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ totalAmount: number; cost: number }[]>`
          SELECT "totalAmount", "cost" FROM "public"."service_records"
          WHERE "id" = ${serviceRecord.id} AND "organizationId" = ${organizationId}
          FOR UPDATE`
        const job = locked[0]
        if (!job) throw new Error('Service record not found')
        const paid = await tx.payment.aggregate({
          where: { serviceRecordId: serviceRecord.id },
          _sum: { amount: true },
        })
        const balanceDue = paymentBalanceDue(job, paid._sum.amount ?? 0)
        if (amount > balanceDue) return { refused: true as const, balanceDue }
        const payment = await tx.payment.create({
          data: {
            serviceRecordId: data.serviceRecordId,
            amount,
            date,
            method: data.method,
            note: data.note || null,
          },
        })
        return { refused: false as const, payment }
      })
      if (outcome.refused) {
        const t = await getTranslations('service.payments')
        const format = await workshopMoneyFormatter(organizationId)
        throw new Error(
          outcome.balanceDue > 0
            ? t('aboveBalance', { amount: format(outcome.balanceDue) })
            : t('nothingDue')
        )
      }
      const { payment } = outcome
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
        amount,
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

/**
 * How much has been paid on one invoice, for the pay code dialog to watch
 * while a customer pays on their own phone. The payment is booked by the
 * vendor's webhook, not by this browser, so the page has to ask; asking for
 * one sum every few seconds is a great deal cheaper than re-rendering the
 * work order to find out.
 */
export async function getPaidTotal(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: { manuallyPaid: true, payments: { select: { amount: true } } },
      })
      if (!record) throw new Error('Service record not found')
      return {
        paid: Math.round(record.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100,
        payments: record.payments.length,
        manuallyPaid: record.manuallyPaid,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
