import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateQuoteSchema } from "@/features/quotes/Schema/quoteSchema";
import { recordDeletion } from "@/lib/sync-deletion";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;
      const body = await request.json();
      const data = updateQuoteSchema.parse({ ...body, id });

      const existing = await db.quote.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      const { id: _id, partItems, laborItems, ...quoteData } = data;

      const quote = await db.$transaction(async (tx) => {
        await tx.quote.update({
          where: { id },
          data: {
            ...quoteData,
            validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
            discountType: quoteData.discountType === "none" ? null : quoteData.discountType,
          },
        });

        if (partItems !== undefined) {
          await tx.quotePart.deleteMany({ where: { quoteId: id } });
          if (partItems.length > 0) {
            await tx.quotePart.createMany({
              data: partItems.map((p) => ({ ...p, quoteId: id })),
            });
          }
        }

        if (laborItems !== undefined) {
          await tx.quoteLabor.deleteMany({ where: { quoteId: id } });
          if (laborItems.length > 0) {
            await tx.quoteLabor.createMany({
              data: laborItems.map((l) => ({ ...l, quoteId: id })),
            });
          }
        }

        return tx.quote.findUniqueOrThrow({
          where: { id },
          include: { partItems: true, laborItems: true },
        });
      });

      return NextResponse.json({ quote });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES },
      ],
    },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;

      const quote = await db.quote.findFirst({
        where: { id, organizationId },
        include: {
          partItems: { select: { id: true } },
          laborItems: { select: { id: true } },
          attachments: { select: { id: true } },
        },
      });
      if (!quote) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      const deletions: Promise<void>[] = [recordDeletion("quote", id, organizationId)];
      if (quote.partItems.length) deletions.push(recordDeletion("quotePart", quote.partItems.map((p) => p.id), organizationId));
      if (quote.laborItems.length) deletions.push(recordDeletion("quoteLabor", quote.laborItems.map((l) => l.id), organizationId));
      if (quote.attachments.length) deletions.push(recordDeletion("quoteAttachment", quote.attachments.map((a) => a.id), organizationId));
      await Promise.all(deletions);

      await db.quote.deleteMany({ where: { id, organizationId } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.QUOTES },
      ],
    },
  );
}
