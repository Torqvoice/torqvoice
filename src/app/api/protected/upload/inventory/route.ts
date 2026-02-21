import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and AVIF images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File size must be under 5MB" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "data", "uploads", ctx.organizationId, "inventory");

  await mkdir(uploadDir, { recursive: true });

  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), bytes);

  return NextResponse.json({ url: `/api/protected/files/${ctx.organizationId}/inventory/${filename}` });
}
