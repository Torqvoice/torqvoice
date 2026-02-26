"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";

export async function deleteQuoteAttachment(attachmentId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const attachment = await db.quoteAttachment.findFirst({
        where: {
          id: attachmentId,
          quote: { organizationId },
        },
        include: {
          quote: { select: { id: true } },
        },
      });
      if (!attachment) throw new Error("Attachment not found");

      // Delete file from disk
      const filePath = resolveUploadPath(attachment.fileUrl);
      try {
        await unlink(filePath);
      } catch (err) {
        console.warn(`[deleteQuoteAttachment] Failed to delete file "${filePath}":`, err);
      }

      await db.quoteAttachment.delete({ where: { id: attachmentId } });

      revalidatePath(`/quotes/${attachment.quote.id}`);
      return { deleted: true };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.QUOTES,
        },
      ],
    }
  );
}
