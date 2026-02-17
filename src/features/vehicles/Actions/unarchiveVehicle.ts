"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function unarchiveVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await db.vehicle.updateMany({
        where: { id: vehicleId, organizationId },
        data: { isArchived: false, archiveReason: null },
      });

      revalidatePath("/");
      revalidatePath("/vehicles");
      revalidatePath(`/vehicles/${vehicleId}`);

      return { success: true as const };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  );
}
