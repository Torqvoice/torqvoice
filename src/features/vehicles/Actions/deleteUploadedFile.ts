"use server";

import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";

/**
 * Delete an uploaded file from disk.
 * Verifies the file URL belongs to the caller's organization.
 */
export async function deleteUploadedFile(fileUrl: string) {
  return withAuth(async ({ organizationId }) => {
    // Only allow deleting files that belong to this org
    if (!fileUrl.startsWith(`/api/files/${organizationId}/`)) {
      throw new Error("Forbidden");
    }

    const filePath = resolveUploadPath(fileUrl);
    await unlink(filePath);
    return { deleted: true };
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES }] });
}
