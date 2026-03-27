import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile, stat } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

export async function GET() {
  const logoSetting = await db.appSetting.findFirst({
    where: { key: "workshop.logo" },
    select: { value: true, organizationId: true },
  });

  if (!logoSetting?.value || !logoSetting.organizationId) {
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  }

  // Extract filename from stored URL like /api/protected/files/orgId/logos/filename
  const urlParts = logoSetting.value.split("/");
  const filename = urlParts[urlParts.length - 1];

  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const filePath = path.join(
    process.cwd(),
    "data",
    "uploads",
    logoSetting.organizationId,
    "logos",
    filename,
  );

  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME_TYPES[ext] || "image/png";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
