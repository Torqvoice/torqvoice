import { db } from '@/lib/db'
import { removeOrganizationFiles } from '@/lib/files/manager'
import { billingRequest, isTorqvoiceComBillingConfigured } from '@/lib/torqvoice-com'

/**
 * Delete an organization completely: cancels its Stripe subscription, deletes
 * the org row (cascading all data), and removes its upload files from disk.
 * The single implementation behind admin deletion, account deletion and the
 * owner's "delete workshop" — org deletion has ordering constraints (see the
 * inspections note below), so new deletion paths must call this rather than
 * `db.organization.delete` directly.
 *
 * Pass `userId` when the caller is removing that user entirely, so their
 * membership row (which does not cascade from user deletion) goes too.
 */
export async function deleteOrganizationWithData(organizationId: string, userId?: string) {
  // End the Stripe subscription before deleting org data. torqvoice.com holds
  // the Stripe keys; a self-hosted install has no Stripe-backed row here.
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    select: { stripeSubscriptionId: true },
  })

  if (subscription?.stripeSubscriptionId && isTorqvoiceComBillingConfigured()) {
    try {
      await billingRequest('end', { organizationId })
    } catch (error) {
      // Already canceled on Stripe's side, or torqvoice.com unreachable: the
      // daily sync ends an orphan either way, and the deletion must go on.
      console.error('[delete-user-data] could not end the subscription:', error)
    }
  }

  // Delete the caller's membership first (not auto-cascaded from user deletion)
  if (userId) {
    await db.organizationMember.deleteMany({
      where: { userId, organizationId },
    })
  }

  // Delete the organization — cascades all org data (vehicles, customers,
  // quotes, inventory, custom fields, settings, roles, invitations,
  // subscription). Inspections must go first: their templateId FK is
  // ON DELETE RESTRICT, which blocks the cascade from resolving templates
  // and inspections in one statement.
  await db.$transaction([
    db.inspection.deleteMany({ where: { organizationId } }),
    db.organization.delete({ where: { id: organizationId } }),
  ])

  // Every file the workshop uploaded lives in its own folder, so that folder
  // is removed whole, under each upload root. Nothing is unlinked by the URLs
  // its rows held: a row restored from another workshop's backup can still
  // name that workshop, and its files are not this one's to delete.
  await removeOrganizationFiles(organizationId)
}

/**
 * Reassign org data from one user to another member, then remove membership.
 */
async function reassignOrgData(organizationId: string, userId: string) {
  const otherMember = await db.organizationMember.findFirst({
    where: { organizationId, NOT: { userId } },
    select: { userId: true },
  })

  if (otherMember) {
    const newOwnerId = otherMember.userId

    await db.$transaction([
      db.vehicle.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.customer.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.quote.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.inventoryPart.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.customFieldDefinition.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.appSetting.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      // A tire set and its warehouse cascade from the user who created them,
      // so a member leaving used to take the workshop's stored tire sets (and
      // their photos) with them.
      db.tireWarehouse.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
      db.tireSet.updateMany({
        where: { userId, organizationId },
        data: { userId: newOwnerId },
      }),
    ])
  }

  await db.organizationMember.deleteMany({
    where: { userId, organizationId },
  })
}

/**
 * Handle all organization cleanup for a user being deleted.
 * For each org the user belongs to:
 *  - If last member: delete the entire org and its data
 *  - If not last member: reassign data to another member
 */
export async function deleteUserOrganizations(userId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  })

  for (const { organizationId } of memberships) {
    const memberCount = await db.organizationMember.count({
      where: { organizationId },
    })

    if (memberCount <= 1) {
      await deleteOrganizationWithData(organizationId, userId)
    } else {
      await reassignOrgData(organizationId, userId)
    }
  }

  // Workshops the user left, or was removed from, can still hold rows the
  // user created, and those cascade from the user: deleting the account would
  // take a workshop's vehicles, jobs, quotes, tire sets and their files with
  // it. They go to one of that workshop's members instead.
  const handled = new Set(memberships.map((m) => m.organizationId))
  for (const organizationId of await organizationsWithRowsOf(userId)) {
    if (!handled.has(organizationId)) await reassignOrgData(organizationId, userId)
  }
}

/** Every workshop in which the user created rows that would cascade with the user. */
async function organizationsWithRowsOf(userId: string): Promise<string[]> {
  const where = { userId }
  const select = { organizationId: true } as const
  const found = await Promise.all([
    db.vehicle.findMany({ where, select, distinct: ['organizationId'] }),
    db.customer.findMany({ where, select, distinct: ['organizationId'] }),
    db.quote.findMany({ where, select, distinct: ['organizationId'] }),
    db.inventoryPart.findMany({ where, select, distinct: ['organizationId'] }),
    db.customFieldDefinition.findMany({ where, select, distinct: ['organizationId'] }),
    db.appSetting.findMany({ where, select, distinct: ['organizationId'] }),
    db.tireWarehouse.findMany({ where, select, distinct: ['organizationId'] }),
    db.tireSet.findMany({ where, select, distinct: ['organizationId'] }),
  ])
  const ids = new Set<string>()
  for (const rows of found) {
    for (const row of rows as { organizationId: string | null }[]) {
      if (row.organizationId) ids.add(row.organizationId)
    }
  }
  return [...ids]
}
