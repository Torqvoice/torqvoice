import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createQuoteSchema } from "@/features/quotes/Schema/quoteSchema";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ userId, organizationId }) => {
      const body = await request.json();
      const data = createQuoteSchema.parse(body);

      // Generate quote number
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ["workshop.quotePrefix"] } },
      });
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;
      const prefix = settingsMap["workshop.quotePrefix"] || "QT-";

      const lastQuote = await db.quote.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: { quoteNumber: true },
      });
      let nextNum = 1001;
      if (lastQuote?.quoteNumber) {
        const match = lastQuote.quoteNumber.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const quoteNumber = `${prefix}${nextNum}`;

      const { partItems, laborItems, ...quoteData } = data;

      const quote = await db.$transaction(async (tx) => {
        const created = await tx.quote.create({
          data: {
            ...quoteData,
            quoteNumber,
            userId,
            organizationId,
            validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
            discountType: quoteData.discountType === "none" ? null : quoteData.discountType,
          },
        });

        if (partItems && partItems.length > 0) {
          await tx.quotePart.createMany({
            data: partItems.map((p) => ({ ...p, quoteId: created.id })),
          });
        }

        if (laborItems && laborItems.length > 0) {
          await tx.quoteLabor.createMany({
            data: laborItems.map((l) => ({ ...l, quoteId: created.id })),
          });
        }

        return tx.quote.findUniqueOrThrow({
          where: { id: created.id },
          include: { partItems: true, laborItems: true },
        });
      });

      return NextResponse.json({ quote }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES },
      ],
    },
  );
}
