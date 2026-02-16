"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { unlink, rm } from "fs/promises";
import path from "path";

export async function deleteAccount() {
  return withAuth(async ({ userId, organizationId }) => {
    // Count other members in the organization
    const memberCount = organizationId
      ? await db.organizationMember.count({
          where: { organizationId },
        })
      : 0;

    const isLastMember = memberCount <= 1;

    if (isLastMember && organizationId) {
      // --- LAST MEMBER: delete everything ---

      // Collect file paths to clean up from disk
      const filePaths: string[] = [];

      const attachments = await db.serviceAttachment.findMany({
        where: { serviceRecord: { vehicle: { organizationId } } },
        select: { fileUrl: true },
      });
      for (const att of attachments) {
        filePaths.push(resolveUploadPath(att.fileUrl));
      }

      const inventoryParts = await db.inventoryPart.findMany({
        where: { organizationId },
        select: { imageUrl: true },
      });
      for (const part of inventoryParts) {
        if (part.imageUrl) filePaths.push(resolveUploadPath(part.imageUrl));
      }

      const vehicles = await db.vehicle.findMany({
        where: { organizationId },
        select: { imageUrl: true },
      });
      for (const v of vehicles) {
        if (v.imageUrl) filePaths.push(resolveUploadPath(v.imageUrl));
      }

      // Delete membership first (not auto-cascaded from user deletion)
      await db.organizationMember.deleteMany({
        where: { userId },
      });

      // Delete the organization — cascades all org data (vehicles, customers,
      // quotes, inventory, custom fields, settings, roles, invitations, subscription)
      await db.organization.delete({
        where: { id: organizationId },
      });

      // Delete the user — cascades sessions, accounts, 2FA
      await db.user.delete({
        where: { id: userId },
      });

      // Clean up files from disk (best effort)
      for (const filePath of filePaths) {
        try {
          await unlink(filePath);
        } catch {
          // File may already be missing
        }
      }

      // Try to remove the org upload directory
      try {
        const orgUploadDir = path.join(process.cwd(), "data", "uploads", organizationId);
        await rm(orgUploadDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }
    } else {
      // --- NOT LAST MEMBER: reassign org data, then delete user ---

      // Find another member to reassign data to
      const otherMember = await db.organizationMember.findFirst({
        where: { organizationId, NOT: { userId } },
        select: { userId: true },
      });

      if (otherMember) {
        const newOwnerId = otherMember.userId;

        // Reassign all org data owned by this user to another member
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
        ]);
      }

      // Remove membership
      await db.organizationMember.deleteMany({
        where: { userId },
      });

      // Delete the user — cascades only user-specific data
      // (sessions, accounts, 2FA; org data was reassigned above)
      await db.user.delete({
        where: { id: userId },
      });
    }

    return { deleted: true };
  });
}
