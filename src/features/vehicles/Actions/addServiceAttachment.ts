"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { serviceAttachmentSchema } from "../Schema/serviceSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getFeatures, type PlanFeatures } from "@/lib/features";
import { z } from "zod";

const addAttachmentSchema = z.object({
  serviceRecordId: z.string(),
  attachment: serviceAttachmentSchema,
});

const CATEGORY_LIMIT_MAP: Record<string, keyof PlanFeatures | undefined> = {
  image: "maxImagesPerService",
  diagnostic: "maxDiagnosticsPerService",
  document: "maxDocumentsPerService",
};

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

      const limitKey = CATEGORY_LIMIT_MAP[data.attachment.category];
      if (limitKey) {
        const features = await getFeatures(organizationId);
        const maxAllowed = features[limitKey] as number;
        const currentCount = await db.serviceAttachment.count({
          where: {
            serviceRecordId: record.id,
            category: data.attachment.category,
          },
        });
        if (currentCount >= maxAllowed) {
          const label = data.attachment.category === "diagnostic"
            ? "Diagnostic report"
            : data.attachment.category.charAt(0).toUpperCase() + data.attachment.category.slice(1);
          throw new Error(
            `${label} limit reached (${currentCount}/${maxAllowed}). Upgrade your plan for more.`
          );
        }
      }

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
