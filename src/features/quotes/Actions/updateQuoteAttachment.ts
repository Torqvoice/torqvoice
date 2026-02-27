"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { z } from "zod";

const updateAttachmentSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  includeInInvoice: z.boolean().optional(),
});

export async function updateQuoteAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateAttachmentSchema.parse(input);

      const attachment = await db.quoteAttachment.findFirst({
        where: {
          id: data.id,
          quote: { organizationId },
        },
        include: {
          quote: { select: { id: true } },
        },
      });
      if (!attachment) throw new Error("Attachment not found");

      const updated = await db.quoteAttachment.update({
        where: { id: data.id },
        data: {
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.includeInInvoice !== undefined && {
            includeInInvoice: data.includeInInvoice,
          }),
        },
      });

      revalidatePath(`/quotes/${attachment.quote.id}`);

      return updated;
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
