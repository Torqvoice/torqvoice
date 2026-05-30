import { db } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe-config'
import { deleteOrganizationFiles } from '@/lib/storage'

/**
 * Clean up a single organization where the user is the last member.
 * Cancels Stripe subscription, deletes org (cascades all data), and removes upload files.
 */
async function deleteOrganization(organizationId: string, userId: string) {
  // Cancel Stripe subscription before deleting org data
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    select: { stripeSubscriptionId: true },
  })

  if (subscription?.stripeSubscriptionId) {
    try {
      const stripe = await getStripeClient()
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId)
    } catch {
      // Subscription may already be canceled on Stripe's side, or Stripe not configured
    }
  }

  // Delete membership first (not auto-cascaded from user deletion)
  await db.organizationMember.deleteMany({
    where: { userId },
  })

  // Delete the organization — cascades all org data (vehicles, customers,
  // quotes, inventory, custom fields, settings, roles, invitations, subscription)
  await db.organization.delete({
    where: { id: organizationId },
  })

  // Clean up files from storage (best effort)
  try {
    await deleteOrganizationFiles(organizationId)
  } catch (err) {
    console.warn(`[deleteOrganization] Failed to delete files for org ${organizationId}:`, err)
  }
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
      await deleteOrganization(organizationId, userId)
    } else {
      await reassignOrgData(organizationId, userId)
    }
  }
}
