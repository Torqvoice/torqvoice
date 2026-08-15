import { db } from '@/lib/db'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { unlink, rm } from 'fs/promises'
import path from 'path'
import { getStripeClient } from '@/lib/stripe-config'

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
  // Collect file paths to clean up from disk
  const filePaths: string[] = []

  const attachments = await db.serviceAttachment.findMany({
    where: { serviceRecord: { organizationId } },
    select: { fileUrl: true },
  })
  for (const att of attachments) {
    filePaths.push(resolveUploadPath(att.fileUrl))
  }

  const inventoryParts = await db.inventoryPart.findMany({
    where: { organizationId },
    select: { imageUrl: true },
  })
  for (const part of inventoryParts) {
    if (part.imageUrl) filePaths.push(resolveUploadPath(part.imageUrl))
  }

  const vehicles = await db.vehicle.findMany({
    where: { organizationId },
    select: { imageUrl: true },
  })
  for (const v of vehicles) {
    if (v.imageUrl) filePaths.push(resolveUploadPath(v.imageUrl))
  }

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

  // Clean up files from disk (best effort)
  for (const filePath of filePaths) {
    try {
      await unlink(filePath)
    } catch {
      // File may already be missing
    }
  }

  // Try to remove the org upload directory
  try {
    const orgUploadDir = path.join(process.cwd(), 'data', 'uploads', organizationId)
    await rm(orgUploadDir, { recursive: true, force: true })
  } catch {
    // Directory may not exist
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
      await deleteOrganizationWithData(organizationId, userId)
    } else {
      await reassignOrgData(organizationId, userId)
    }
  }
}
