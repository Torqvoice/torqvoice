import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const segments = (await params).path;
      // Expected: [orgId, category, filename]
      if (segments.length !== 3) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      }

      const [orgId, category, filename] = segments;

      // Verify user belongs to the requested org
      if (orgId !== organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const allowedCategories = ["vehicles", "inventory", "services", "logos", "quotes"];
      if (!allowedCategories.includes(category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }

      // Prevent directory traversal
      if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
        return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
      }

      const filePath = path.join(process.cwd(), "data", "uploads", orgId, category, filename);

      try {
        await stat(filePath);
      } catch {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const buffer = await readFile(filePath);
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
