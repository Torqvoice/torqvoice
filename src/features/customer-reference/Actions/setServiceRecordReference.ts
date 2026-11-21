'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeCustomerReference } from '../Lib/reference'
import { isCustomerReferenceEnabled } from '../Lib/referenceSetting'

/**
 * Saves the customer's reference / PO on a work order or counter sale, on
 * its own.
 *
 * Not part of the work order's Save, and not stopped by a locked invoice:
 * the purchase order number often arrives after the invoice has gone out,
 * and it is not one of the figures the lock freezes. It prints from the row,
 * so the issued invoice shows it from the next time it is opened.
 */
export async function setServiceRecordReference(recordId: string, reference: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (typeof recordId !== 'string' || typeof reference !== 'string') {
        throw new Error('Invalid reference')
      }
      // A workshop that has the field off has no box to type in; refuse
      // rather than write what nobody there can see.
      if (!(await isCustomerReferenceEnabled(organizationId))) {
        // Said to whoever is signed in, so in their language.
        throw new Error((await getTranslations('service.reference'))('notSwitchedOn'))
      }
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, invoiceNumber: true, vehicleId: true },
      })
      if (!record) throw new Error('Record not found')

      const customerReference = normalizeCustomerReference(reference)
      await db.serviceRecord.update({ where: { id: record.id }, data: { customerReference } })

      revalidatePath('/work-orders')
      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      else revalidatePath(`/sales/${record.id}`)
      return { id: record.id, invoiceNumber: record.invoiceNumber, customerReference }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: result.id,
        details: { key: 'service_update', params: { ref: result.invoiceNumber || result.id } },
        metadata: { serviceRecordId: result.id, field: 'customerReference' },
      }),
    }
  )
}
