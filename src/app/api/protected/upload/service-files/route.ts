import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { uploadFile } from "@/lib/storage";

const execFileAsync = promisify(execFile);

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_SIZE = 500 * 1024 * 1024; // 500MB
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

async function compressVideo(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-i", inputPath,
      "-vf", "scale=-2:720",       // Scale to 720p, keep aspect ratio
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "28",                 // Good quality/size balance
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",    // Web-optimized
      "-y",                         // Overwrite
      outputPath,
    ], { timeout: 300000 });        // 5 min timeout
    return true;
  } catch {
    return false;
  }
}

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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Supported: JPEG, PNG, WebP, PDF, CSV, TXT, MP4, WebM, MOV" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File size must be under 500MB" },
      { status: 400 }
    );
  }

  const isVideo = VIDEO_TYPES.includes(file.type);
  const ext = isVideo ? "mp4" : (file.name.split(".").pop() || "bin");
  const filename = `${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  let uploadBuffer: Buffer | Uint8Array = bytes;

  if (isVideo) {
    const tempDir = path.join(os.tmpdir(), "taller-compress");
    await mkdir(tempDir, { recursive: true });

    const tempOrigPath = path.join(tempDir, `${crypto.randomUUID()}_orig.${file.name.split(".").pop() || "mp4"}`);
    const tempCompPath = path.join(tempDir, `${crypto.randomUUID()}_comp.mp4`);

    await writeFile(tempOrigPath, bytes);
    const compressed = await compressVideo(tempOrigPath, tempCompPath);
    await unlink(tempOrigPath).catch(() => {});

    if (compressed) {
      try {
        uploadBuffer = await readFile(tempCompPath);
        await unlink(tempCompPath).catch(() => {});
      } catch {
        // Fallback: original
        uploadBuffer = bytes;
      }
    } else {
      uploadBuffer = bytes;
    }
  }

  const url = await uploadFile(
    "services",
    filename,
    uploadBuffer,
    isVideo ? "video/mp4" : file.type,
    ctx.organizationId
  );

  return NextResponse.json({
    url,
    fileName: file.name,
    fileType: isVideo ? "video/mp4" : file.type,
    fileSize: uploadBuffer.length,
  });
}
