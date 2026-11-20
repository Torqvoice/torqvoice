'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { assertQuoteEditable } from '@/lib/document-lock.server'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { equipmentEnabled } from '../Lib/equipmentGate.server'
import { checkedWorkOnItems, writeJobWorkOn } from '../Lib/jobWorkOn.server'
import { setWorkOnSchema } from '../Schema/equipmentSchema'

/**
 * What a work order works on ("Work on"): several items, since one visit often
 * covers the crane and the tail lift. Saved on its own as it is picked. An
 * item taken off the list takes its meter readings on this job with it: they
 * stay in the item's history, no longer the job's.
 */
export async function setJobEquipment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = setWorkOnSchema.parse(input)
      const result = await writeJobWorkOn({
        organizationId,
        jobId: data.id,
        itemIds: data.itemIds,
      })
      revalidatePath(`/vehicles/${result.vehicleId}`)
      return { jobId: result.jobId, jobRef: result.jobRef, itemIds: result.itemIds }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: result.jobId,
        details: { key: 'service_update', params: { ref: result.jobRef } },
        metadata: { serviceRecordId: result.jobId, equipmentItemIds: result.itemIds },
      }),
    }
  )
}

/** The same for a quote; its picks go with it to the work order it becomes. */
export async function setQuoteEquipment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      if (!(await equipmentEnabled(organizationId))) throw new Error('Equipment not found')
      const data = setWorkOnSchema.parse(input)
      const quote = await db.quote.findFirst({
        where: { id: data.id, organizationId },
        select: { id: true, vehicleId: true, quoteNumber: true },
      })
      if (!quote?.vehicleId) throw new Error('Quote not found')
      await assertQuoteEditable(quote.id, organizationId)
      const before = (
        await db.quoteEquipment.findMany({
          where: { organizationId, quoteId: quote.id },
          select: { itemId: true },
        })
      ).map((row) => row.itemId)
      const itemIds = await checkedWorkOnItems(
        organizationId,
        quote.vehicleId,
        data.itemIds,
        before
      )
      const dropped = before.filter((id) => !itemIds.includes(id))
      const added = itemIds.filter((id) => !before.includes(id))
      await db.$transaction(async (tx) => {
        if (dropped.length > 0) {
          await tx.quoteEquipment.deleteMany({
            where: { organizationId, quoteId: quote.id, itemId: { in: dropped } },
          })
        }
        if (added.length > 0) {
          await tx.quoteEquipment.createMany({
            data: added.map((itemId) => ({ quoteId: quote.id, itemId, organizationId })),
            skipDuplicates: true,
          })
        }
      })
      revalidatePath(`/quotes/${quote.id}`)
      return { quoteId: quote.id, quoteRef: quote.quoteNumber || quote.id, itemIds }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.update',
        entity: 'Quote',
        entityId: result.quoteId,
        details: { key: 'quote_update', params: { ref: result.quoteRef } },
        metadata: { quoteId: result.quoteId, equipmentItemIds: result.itemIds },
      }),
    }
  )
}
