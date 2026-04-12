"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function archiveVehicle(vehicleId: string, reason?: string) {
  return withAuth(
    async ({ organizationId }) => {
      const result = await db.vehicle.updateMany({
        where: { id: vehicleId, organizationId },
        data: { isArchived: true, archiveReason: reason || null },
      });
      if (result.count === 0) throw new Error("Vehicle not found");

      revalidatePath("/");
      revalidatePath("/vehicles");
      revalidatePath(`/vehicles/${vehicleId}`);

      return { success: true as const, vehicleId };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: "vehicle.archive",
        entity: "Vehicle",
        entityId: result.vehicleId,
        message: `Archived vehicle ${result.vehicleId}`,
        metadata: { vehicleId: result.vehicleId },
      }),
    }
  );
}
