"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function unarchiveVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const result = await db.vehicle.updateMany({
        where: { id: vehicleId, organizationId },
        data: { isArchived: false, archiveReason: null },
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
        action: "vehicle.unarchive",
        entity: "Vehicle",
        entityId: result.vehicleId,
        message: `Unarchived vehicle ${result.vehicleId}`,
        metadata: { vehicleId: result.vehicleId },
      }),
    }
  );
}
