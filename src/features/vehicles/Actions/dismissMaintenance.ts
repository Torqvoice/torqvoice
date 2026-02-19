"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function dismissMaintenance(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        maintenanceDismissed: true,
        maintenanceDismissedAt: new Date(),
      },
    });

    revalidatePath("/");
    revalidatePath(`/vehicles/${vehicleId}`);
    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function undismissMaintenance(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        maintenanceDismissed: false,
        maintenanceDismissedAt: null,
      },
    });

    revalidatePath("/");
    revalidatePath(`/vehicles/${vehicleId}`);
    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}
