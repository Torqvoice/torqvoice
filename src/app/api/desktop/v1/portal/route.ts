import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function GET(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { portalSlug: true },
    });

    const portalEnabled = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: "portal.enabled" } },
    });

    return NextResponse.json({
      portalSlug: org?.portalSlug || null,
      portalEnabled: portalEnabled?.value === "true",
    });
  });
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{1,46}[a-z0-9]$/;
const RESERVED_SLUGS = ["auth", "api", "admin", "login", "verify", "dashboard", "settings", "portal"];

export async function PUT(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const body = await request.json();
    const { slug, enabled } = body;

    // Update portal enabled setting if provided
    if (enabled !== undefined) {
      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key: "portal.enabled" } },
        update: { value: String(enabled) },
        create: {
          organizationId,
          key: "portal.enabled",
          value: String(enabled),
          userId: "", // system setting
        },
      });
    }

    // Update slug if provided
    if (slug !== undefined) {
      if (!slug || slug.trim() === "") {
        await db.organization.update({
          where: { id: organizationId },
          data: { portalSlug: null },
        });
      } else {
        const normalized = slug.trim().toLowerCase();

        if (!SLUG_REGEX.test(normalized)) {
          return NextResponse.json(
            { error: "Slug must be 3-48 characters, lowercase alphanumeric, hyphens, or underscores." },
            { status: 400 },
          );
        }

        if (RESERVED_SLUGS.includes(normalized)) {
          return NextResponse.json({ error: "This slug is reserved." }, { status: 400 });
        }

        const existing = await db.organization.findUnique({
          where: { portalSlug: normalized },
          select: { id: true },
        });

        if (existing && existing.id !== organizationId) {
          return NextResponse.json({ error: "This slug is already taken." }, { status: 400 });
        }

        await db.organization.update({
          where: { id: organizationId },
          data: { portalSlug: normalized },
        });
      }
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { portalSlug: true },
    });

    return NextResponse.json({ portalSlug: org?.portalSlug || null });
  });
}
