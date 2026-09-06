'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { assertInvoiceEditable } from '@/lib/document-lock.server'

/**
 * Chooses which design one invoice prints with. Null goes back to following
 * the customer's design and the workshop's default. Refused on a locked
 * invoice like any other edit: what a locked invoice prints is settled.
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
