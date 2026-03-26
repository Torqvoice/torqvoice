"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export interface MyActiveJob {
  id: string;
  title: string;
  status: string;
  vehicleId: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
  imageCount: number;
}

export async function getMyActiveJobs() {
  return withAuth(
    async ({ userId, organizationId }) => {
      // Find technician records linked to this user
      const myTechnicians = await db.technician.findMany({
        where: { organizationId, userId, isActive: true },
        select: { id: true },
      });

      if (myTechnicians.length === 0) return [];

      const techIds = myTechnicians.map((t) => t.id);

      const records = await db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          status: { in: ["in-progress", "pending", "waiting-parts"] },
          technicianId: { in: techIds },
        },
        select: {
          id: true,
          title: true,
          status: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
          _count: {
            select: {
              attachments: {
                where: { category: "image" },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });

      return records.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        vehicleId: r.vehicleId,
        vehicle: r.vehicle,
        imageCount: r._count.attachments,
      }));
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    }
  );
}
