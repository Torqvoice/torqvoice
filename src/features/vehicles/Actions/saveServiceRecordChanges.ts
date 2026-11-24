'use server'

import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { parseSentFields, sentId } from '@/lib/parse-sent-fields'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { writeServiceRecordUpdate } from '@/features/vehicles/Lib/writeServiceRecordUpdate.server'
import { saveServiceChangesSchema } from '../Schema/serviceSchema'

/**
 * Saves what one tab of a work order changed, and nothing else.
 *
 * The page used to send its whole form (updateServiceRecord). With the same
 * job open in two tabs, the one opened earlier sent back every field as it
 * had first read it, and a note saved in the other tab was gone the moment
 * this one saved its mileage. Now each field the page did not change is left
 * out, and left as it is stored; when both tabs changed the same field the
 * later save wins, and the page that lost hears about it (see
 * changedElsewhere in useServiceFormState).
 *
 * No money is taken from the page: its totals are reckoned from the lines it
 * holds, which may not be the lines stored. They are worked out here from what
 * is stored once this save is written.
 *
 * A new name rather than a new meaning for updateServiceRecord: a tab opened
 * before the deploy still calls that one with its whole form.
 */
export async function saveServiceRecordChanges(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      // The lock first, before the input is read, as for the whole-form save.
      const recordId = sentId(input)
      if (recordId) await assertInvoiceEditable(recordId, organizationId)
      const data = parseSentFields(saveServiceChangesSchema, input)
      return writeServiceRecordUpdate({ userId, organizationId }, data, { retotal: true })
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
        metadata: { serviceRecordId: result.id },
      }),
    }
  )
}
