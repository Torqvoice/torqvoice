import { db } from '@/lib/db'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { unlink, rm } from 'fs/promises'
import path from 'path'
import Stripe from 'stripe'

/**
 * Clean up a single organization where the user is the last member.
 * Cancels Stripe subscription, deletes org (cascades all data), and removes upload files.
 */
async function deleteOrganization(organizationId: string, userId: string) {
  // Collect file paths to clean up from disk
  const filePaths: string[] = []

  const attachments = await db.serviceAttachment.findMany({
    where: { serviceRecord: { vehicle: { organizationId } } },
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

  if (subscription?.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId)
    } catch {
      // Subscription may already be canceled on Stripe's side
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
      await deleteOrganization(organizationId, userId)
    } else {
      await reassignOrgData(organizationId, userId)
    }
  }
}
