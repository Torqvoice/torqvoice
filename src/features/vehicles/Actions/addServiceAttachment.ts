"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { serviceAttachmentSchema } from "../Schema/serviceSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { z } from "zod";

const addAttachmentSchema = z.object({
  serviceRecordId: z.string(),
  attachment: serviceAttachmentSchema,
});

export async function addServiceAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = addAttachmentSchema.parse(input);

      const record = await db.serviceRecord.findFirst({
        where: {
          id: data.serviceRecordId,
          vehicle: { organizationId },
        },
        select: { id: true, vehicleId: true },
      });
      if (!record) throw new Error("Service record not found");

      const attachment = await db.serviceAttachment.create({
        data: {
          ...data.attachment,
          serviceRecordId: record.id,
        },
      });

      revalidatePath(
        `/vehicles/${record.vehicleId}/service/${record.id}`
      );

      return attachment;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.SERVICES,
        },
      ],
    }
  );
}
