'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Reopening a locked invoice or quote, and closing it again.
 *
 * Restricted to owners and admins, and written to the audit log, because this
 * is the one way to change a document the rules say is settled. Without it the
 * first genuinely wrong locked invoice has no route to a fix, and the usual
 * outcome is that locking gets turned off for everyone and never turned back
 * on. A narrow, recorded exception keeps the guardrail useful.
 *
 * The unlock has no expiry. Re-locking is a deliberate second action, so the
 * document keeps saying it was reopened until someone closes it, and the
 * screen can show that.
 */

function requireAdmin(isAdmin: boolean) {
  if (!isAdmin) {
    throw new Error('Only an owner or admin can unlock a document')
  }
}

export async function setInvoiceEditUnlocked(recordId: string, unlocked: boolean) {
  return withAuth(
    async ({ userId, organizationId, isAdmin }) => {
      requireAdmin(isAdmin)

      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, vehicleId: true, invoiceNumber: true },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({
        where: { id: recordId },
        data: {
          editUnlockedAt: unlocked ? new Date() : null,
          editUnlockedById: unlocked ? userId : null,
        },
      })

      revalidatePath(
        record.vehicleId
          ? `/vehicles/${record.vehicleId}/service/${recordId}`
          : `/sales/${recordId}`
      )
      return { recordId, unlocked, reference: record.invoiceNumber || recordId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: result.unlocked ? 'invoice.unlock' : 'invoice.relock',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        message: result.unlocked
          ? `Unlocked invoice ${result.reference} for editing`
          : `Re-locked invoice ${result.reference}`,
        metadata: { serviceRecordId: result.recordId },
      }),
    }
  )
}

export async function setQuoteEditUnlocked(quoteId: string, unlocked: boolean) {
  return withAuth(
    async ({ userId, organizationId, isAdmin }) => {
      requireAdmin(isAdmin)

      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        select: { id: true, quoteNumber: true },
      })
      if (!quote) throw new Error('Quote not found')

      await db.quote.update({
        where: { id: quoteId },
        data: {
          editUnlockedAt: unlocked ? new Date() : null,
          editUnlockedById: unlocked ? userId : null,
        },
      })

      revalidatePath(`/quotes/${quoteId}`)
      return { quoteId, unlocked, reference: quote.quoteNumber || quoteId }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: result.unlocked ? 'quote.unlock' : 'quote.relock',
        entity: 'Quote',
        entityId: result.quoteId,
        message: result.unlocked
          ? `Unlocked quote ${result.reference} for editing`
          : `Re-locked quote ${result.reference}`,
        metadata: { quoteId: result.quoteId },
      }),
    }
  )
}
