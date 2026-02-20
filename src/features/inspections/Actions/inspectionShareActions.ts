"use server";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function generateInspectionPublicLink(inspectionId: string) {
  return withAuth(async ({ organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: { id: inspectionId, organizationId },
    });
    if (!inspection) throw new Error("Inspection not found");

    const token = randomUUID();
    await db.inspection.update({
      where: { id: inspectionId },
      data: { publicToken: token },
    });

    revalidatePath(`/inspections/${inspectionId}`);
    return { token, organizationId };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function revokeInspectionPublicLink(inspectionId: string) {
  return withAuth(async ({ organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: { id: inspectionId, organizationId },
    });
    if (!inspection) throw new Error("Inspection not found");

    await db.inspection.update({
      where: { id: inspectionId },
      data: { publicToken: null },
    });

    revalidatePath(`/inspections/${inspectionId}`);
    return { revoked: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}
