'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { ISSUED_WHERE, issuedDesignState, reapplyDesign } from '../Lib/reapplyDesign'

/**
 * Chooses which design one invoice prints with. Null goes back to following
 * the customer's design and the workshop's default. Refused on a locked
 * invoice like any other edit: what a locked invoice prints is settled.
 *
 * An invoice that was shared or sent but is still open to edits takes the
 * choice at once, the way it takes a new labor line. Its frozen look is moved
 * to the chosen design; the workshop and customer details it was issued with
 * stay as they were. Saving the choice and leaving the sheet unchanged made
 * the picker look broken on every invoice whose link had been shared.
 */
export async function setInvoiceDesign(recordId: string, designId: string | null) {
  return withAuth(
    async ({ organizationId }) => {
      await assertInvoiceEditable(recordId, organizationId)
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, vehicleId: true },
      })
      if (!record) throw new Error('Record not found')

      if (designId) {
        const design = await db.documentDesign.findFirst({
          where: { id: designId, organizationId, documentType: 'invoice' },
          select: { id: true },
        })
        if (!design) throw new Error('Design not found')
      }

      await db.serviceRecord.update({
        where: { id: recordId },
        data: { designId: designId || null },
      })
      // After the write: following the default is resolved from the record's
      // own choice. A draft is skipped, it prints from the live design already.
      await reapplyDesign(organizationId, [recordId], designId || null)

      revalidatePath(
        record.vehicleId
          ? `/vehicles/${record.vehicleId}/service/${recordId}`
          : `/sales/${recordId}`
      )
      return { recordId, designId: designId || null }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.setInvoiceDesign',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        details: { key: 'service_setInvoiceDesign' },
        metadata: { designId: result.designId },
      }),
    }
  )
}

/**
 * Putting the design in use now onto invoices that were issued with an older
 * one, for the whole archive from invoice settings or for a single invoice
 * from its own page. What this moves and what it leaves alone is described in
 * Lib/reapplyDesign.ts.
 *
 * Both are written to the audit log: this is a deliberate change to documents
 * the rules otherwise hold still, and it cannot be undone.
 *
 * They are guarded differently on purpose. The archive run sits in invoice
 * settings beside the one-way lock of older invoices and answers to the same
 * permission: whoever may edit settings may already change the active design
 * and lock the whole archive. The single-invoice one sits beside the unlock
 * on a document a customer holds, so it answers to the same rule as that
 * unlock and is an owner's or admin's call.
 */

function requireAdmin(isAdmin: boolean) {
  if (!isAdmin) {
    throw new Error('Only an owner or admin can re-apply a design to one issued invoice')
  }
}

/** How many invoices the archive run would touch, for the warning it shows. */
export async function countIssuedInvoices() {
  return withAuth(
    async ({ organizationId }) => db.serviceRecord.count({ where: ISSUED_WHERE(organizationId) }),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/** How many invoices one call re-applies, so the request stays short. */
const BATCH = 100

/**
 * Re-applies the current design to a batch of issued invoices and hands back
 * the cursor for the next one. A cursor rather than a shrinking count: unlike
 * the one-way lock of older invoices, a re-applied invoice still matches the
 * set being walked, so counting what is left would never reach zero.
 */
export async function reapplyDesignToIssuedInvoices(cursorId?: string) {
  return withAuth(
    async ({ organizationId }) => {
      const batch = await db.serviceRecord.findMany({
        where: ISSUED_WHERE(organizationId),
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      })
      const updated = await reapplyDesign(
        organizationId,
        batch.map((r) => r.id)
      )
      revalidatePath('/settings/invoice')
      return {
        updated,
        // A short batch is the last one; a full one may still have more.
        nextCursor: batch.length === BATCH ? (batch[batch.length - 1]?.id ?? null) : null,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.reapplyInvoiceDesign',
        entity: 'ServiceRecord',
        details: { key: 'settings_reapplyInvoiceDesign', params: { count: result.updated } },
        metadata: { updated: result.updated },
      }),
    }
  )
}

/**
 * What the menu on one invoice needs to describe itself: when the invoice was
 * issued, which design it prints with now, and what else it could print with.
 * Null for an invoice that is not issued, which has no frozen look to change.
 */
export async function getIssuedDesignState(recordId: string) {
  return withAuth(({ organizationId }) => issuedDesignState(organizationId, recordId), {
    requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
  })
}

/**
 * The same re-apply, for the one invoice open on screen, and with a choice:
 * `designId` names a saved design, null goes back to whichever design the
 * invoice would follow now.
 *
 * The pick is written to `designId` as well as to the snapshot. Otherwise an
 * owner who unlocks and re-sends the invoice later would silently lose it,
 * since the re-capture on send reads the live choice.
 */
export async function reapplyDesignToInvoice(recordId: string, designId: string | null) {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      requireAdmin(isAdmin)
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, vehicleId: true, invoiceNumber: true, issuedAt: true },
      })
      if (!record) throw new Error('Record not found')
      if (!record.issuedAt) throw new Error('This invoice is not locked to a design')

      const updated = await reapplyDesign(organizationId, [record.id], designId)
      await db.serviceRecord.update({
        where: { id: record.id },
        data: { designId: designId || null },
      })
      revalidatePath(
        record.vehicleId
          ? `/vehicles/${record.vehicleId}/service/${recordId}`
          : `/sales/${recordId}`
      )
      return { recordId, updated, designId, reference: record.invoiceNumber || recordId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'invoice.reapplyDesign',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        message: `Changed the design of issued invoice ${result.reference}`,
        metadata: { serviceRecordId: result.recordId, designId: result.designId },
      }),
    }
  )
}
