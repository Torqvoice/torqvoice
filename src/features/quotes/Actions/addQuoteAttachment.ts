"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { quoteAttachmentSchema } from "../Schema/quoteSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getFeatures, type PlanFeatures } from "@/lib/features";
import { z } from "zod";

const addAttachmentSchema = z.object({
  quoteId: z.string(),
  attachment: quoteAttachmentSchema,
});

const CATEGORY_LIMIT_MAP: Record<string, keyof PlanFeatures | undefined> = {
  image: "maxImagesPerService",
  document: "maxDocumentsPerService",
};

export async function addQuoteAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = addAttachmentSchema.parse(input);

      const quote = await db.quote.findFirst({
        where: {
          id: data.quoteId,
          organizationId,
        },
        select: { id: true },
      });
      if (!quote) throw new Error("Quote not found");

      const limitKey = CATEGORY_LIMIT_MAP[data.attachment.category];
      if (limitKey) {
        const features = await getFeatures(organizationId);
        const maxAllowed = features[limitKey] as number;
        const currentCount = await db.quoteAttachment.count({
          where: {
            quoteId: quote.id,
            category: data.attachment.category,
          },
        });
        if (currentCount >= maxAllowed) {
          const label =
            data.attachment.category.charAt(0).toUpperCase() +
            data.attachment.category.slice(1);
          throw new Error(
            `${label} limit reached (${currentCount}/${maxAllowed}). Upgrade your plan for more.`
          );
        }
      }

      const attachment = await db.quoteAttachment.create({
        data: {
          ...data.attachment,
          quoteId: quote.id,
        },
      });

      revalidatePath(`/quotes/${quote.id}`);

      return attachment;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.QUOTES,
        },
      ],
    }
  );
}
