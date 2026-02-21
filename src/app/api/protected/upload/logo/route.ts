import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { resolveUploadPath } from "@/lib/resolve-upload-path";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();

    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be under 2MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
    const fileName = `${randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "data", "uploads", ctx.organizationId, "logos");

    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, fileName), buffer);

    const url = `/api/protected/files/${ctx.organizationId}/logos/${fileName}`;

    // Delete old logo file if one exists
    const oldLogo = await db.appSetting.findFirst({
      where: { organizationId: ctx.organizationId, key: "workshop.logo" },
      select: { value: true },
    });
    if (oldLogo?.value) {
      try {
        await unlink(resolveUploadPath(oldLogo.value));
      } catch {
        // Old file may already be gone
      }
    }

    return NextResponse.json({ url, fileName });
  } catch (error) {
    console.error("[Logo Upload] Error:", error);
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
  }
}
