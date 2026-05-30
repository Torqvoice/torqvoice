import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be under 10MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
    const fileName = `${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFile("logos", fileName, buffer, file.type, ctx.organizationId);

    // Delete old logo file if one exists
    const oldLogo = await db.appSetting.findFirst({
      where: { organizationId: ctx.organizationId, key: "workshop.logo" },
      select: { value: true },
    });
    if (oldLogo?.value) {
      try {
        await deleteFile(oldLogo.value);
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
