import { NextRequest, NextResponse } from "next/server";
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
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: segments } = await params;

  // Expected: [category, filename]
  if (segments.length !== 2) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const [category, filename] = segments;

  const allowedCategories = ["vehicles", "inventory", "services", "logos"];
  if (!allowedCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Prevent directory traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Validate token and get org (check both invoice and quote tokens)
  let orgId: string | undefined;

  const serviceRecord = await db.serviceRecord.findUnique({
    where: { publicToken: token },
    select: { vehicle: { select: { organizationId: true } } },
  });

  if (serviceRecord?.vehicle.organizationId) {
    orgId = serviceRecord.vehicle.organizationId;
  } else {
    const quote = await db.quote.findFirst({
      where: { publicToken: token },
      select: { organizationId: true },
    });
    if (quote?.organizationId) {
      orgId = quote.organizationId;
    } else {
      const inspection = await db.inspection.findFirst({
        where: { publicToken: token },
        select: { organizationId: true },
      });
      if (inspection?.organizationId) {
        orgId = inspection.organizationId;
      }
    }
  }

  if (!orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
