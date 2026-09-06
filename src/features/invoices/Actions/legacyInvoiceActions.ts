'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { issueInvoice } from '../Lib/issueInvoice'

/**
 * Invoices that reached a customer before issuing existed: sent, shared,
 * paid or marked paid, and never issued. They print from live rows, so a
 * changed address, logo, terms or title still reaches them. Nothing captures
 * them behind the workshop's back; invoice settings shows the count and
 * offers to lock them with the design and details in use right now.
 *
 * The screen says "lock", which is the word a workshop uses for a document
 * that must stop changing, and the same word the manual uses. In the code the
 * act is called issuing, because it is the same capture that a send performs.
 */
const LEGACY_WHERE = (organizationId: string) => ({
  organizationId,
  issuedAt: null,
  OR: [{ sentAt: { not: null } }, { manuallyPaid: true }, { payments: { some: {} } }],
})

export async function countUnfrozenInvoices() {
  return withAuth(
    async ({ organizationId }) => db.serviceRecord.count({ where: LEGACY_WHERE(organizationId) }),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/** How many invoices one call locks, so the request stays short. */
const FREEZE_BATCH = 100

/**
 * Locks a batch of those invoices with the current design and details, and
 * says how many are left. The page calls it until nothing remains, which
 * keeps a workshop with thousands of old invoices inside request limits.
 */
export async function freezeUnfrozenInvoices() {
  return withAuth(
    async ({ organizationId }) => {
      const batch = await db.serviceRecord.findMany({
        where: LEGACY_WHERE(organizationId),
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: FREEZE_BATCH,
      })
      let frozen = 0
      for (const record of batch) {
        if (await issueInvoice(record.id, organizationId, 'backfill')) frozen += 1
      }
      const remaining = await db.serviceRecord.count({ where: LEGACY_WHERE(organizationId) })
      revalidatePath('/settings/invoice')
      return { frozen, remaining }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.freezeInvoices',
        entity: 'ServiceRecord',
        details: { key: 'settings_freezeInvoices', params: { count: result.frozen } },
        metadata: { frozen: result.frozen, remaining: result.remaining },
      }),
    }
  )
}
