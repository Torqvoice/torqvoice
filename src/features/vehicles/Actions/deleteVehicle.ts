"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function deleteVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await db.vehicle.deleteMany({
        where: { id: vehicleId, organizationId },
      });

      revalidatePath("/");
      revalidatePath("/vehicles");

      return { success: true as const };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES },
      ],
    }
  );
}
