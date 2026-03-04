import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function PUT(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId, userId }) => {
      const body = await request.json();
      const { settings } = body;

      if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return NextResponse.json(
          { error: "Invalid body: expected { settings: Record<string, string> }" },
          { status: 400 },
        );
      }

      const entries = Object.entries(settings) as [string, string][];

      if (entries.length === 0) {
        return NextResponse.json(
          { error: "No settings provided" },
          { status: 400 },
        );
      }

      // Validate all values are strings
      for (const [key, value] of entries) {
        if (typeof key !== "string" || typeof value !== "string") {
          return NextResponse.json(
            { error: `Invalid setting: key and value must be strings` },
            { status: 400 },
          );
        }
      }

      // Upsert each setting
      await Promise.all(
        entries.map(([key, value]) =>
          db.appSetting.upsert({
            where: {
              organizationId_key: { organizationId, key },
            },
            create: {
              key,
              value,
              userId,
              organizationId,
            },
            update: {
              value,
            },
          }),
        ),
      );

      // Return updated settings for this org
      const allSettings = await db.appSetting.findMany({
        where: { organizationId },
        select: { key: true, value: true },
      });

      const result: Record<string, string> = {};
      for (const s of allSettings) {
        result[s.key] = s.value;
      }

      return NextResponse.json({ settings: result });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
