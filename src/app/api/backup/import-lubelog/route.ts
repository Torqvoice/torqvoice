import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";
import { mkdir, writeFile, stat, readdir, rm } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import os from "os";
import { BSON } from "bson";
import JSZip from "jszip";

// Allow up to 5 minutes for large imports
export const maxDuration = 300;

// ── LiteDB BSON document extraction ─────────────────────────────────────────

interface LubeLogVehicle {
  _id: number;
  Year: number;
  Make: string;
  Model: string;
  LicensePlate?: string;
  ImageLocation?: string;
  IsElectric?: boolean;
  IsDiesel?: boolean;
  PurchasePrice?: { $numberDecimal: string } | number;
  SoldPrice?: { $numberDecimal: string } | number;
}

interface LubeLogServiceRecord {
  _id: number;
  VehicleId: number;
  Date: string;
  Mileage: number;
  Description: string;
  Cost: { $numberDecimal: string } | number;
  Notes?: string;
  Files: { Name: string; Location: string; IsPending?: boolean }[];
  Tags?: string[];
  ExtraFields?: unknown[];
}

interface LubeLogNote {
  _id: number;
  VehicleId: number;
  Description: string;
  NoteText: string;
  Pinned?: boolean;
  Files?: { Name: string; Location: string }[];
}

function extractBsonDocuments(buffer: Buffer) {
  const docs: Record<string, unknown>[] = [];
  let offset = 0;
  while (offset < buffer.length - 4) {
    const size = buffer.readInt32LE(offset);
    if (
      size > 10 &&
      size < 65536 &&
      offset + size <= buffer.length &&
      buffer[offset + size - 1] === 0x00
    ) {
      try {
        const doc = BSON.deserialize(buffer.subarray(offset, offset + size));
        const keys = Object.keys(doc);
        if (keys.length > 1 && keys.some((k) => /^[a-zA-Z_]/.test(k))) {
          docs.push(doc as Record<string, unknown>);
        }
      } catch {
        // Not a valid BSON document — skip
      }
    }
    offset++;
  }
  return docs;
}

function classifyDocuments(docs: Record<string, unknown>[]) {
  const vehicles: LubeLogVehicle[] = [];
  const serviceRecords: LubeLogServiceRecord[] = [];
  const notes: LubeLogNote[] = [];

  for (const doc of docs) {
    if (doc.Make && doc.Model && doc.Year) {
      vehicles.push(doc as unknown as LubeLogVehicle);
    } else if (
      doc.VehicleId !== undefined &&
      doc.Date &&
      doc.Description &&
      doc.Cost !== undefined &&
      !("NoteText" in doc)
    ) {
      serviceRecords.push(doc as unknown as LubeLogServiceRecord);
    } else if ("NoteText" in doc && doc.VehicleId !== undefined) {
      notes.push(doc as unknown as LubeLogNote);
    }
  }

  return { vehicles, serviceRecords, notes };
}

function parseDecimal(
  value: { $numberDecimal: string } | number | undefined
): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  if (value.$numberDecimal) {
    const parsed = Number.parseFloat(value.$numberDecimal);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function determineFuelType(v: LubeLogVehicle): string {
  if (v.IsElectric) return "electric";
  if (v.IsDiesel) return "diesel";
  return "gasoline";
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv",
    txt: "text/plain",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
}

/**
 * Find the actual backup directory. Accepts either:
 *  - A direct path to the extracted backup folder (contains data/cartracker.db)
 *  - A parent directory that contains a single lubelog backup subfolder
 */
async function resolveBackupDir(inputPath: string): Promise<string> {
  // Check if this directory itself has data/cartracker.db
  const directDb = path.join(inputPath, "data", "cartracker.db");
  try {
    await stat(directDb);
    return inputPath;
  } catch {
    // Not found — look for a subdirectory
  }

  // Check if it contains a lubelog backup subdirectory
  const entries = await readdir(inputPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("lubelog_db_backup")) {
      const subDb = path.join(inputPath, entry.name, "data", "cartracker.db");
      try {
        await stat(subDb);
        return path.join(inputPath, entry.name);
      } catch {
        // Not this one
      }
    }
  }

  throw new Error(
    "Could not find data/cartracker.db in the backup. " +
    "Make sure you are uploading a valid LubeLog backup zip."
  );
}

/**
 * Extract a zip buffer to a temporary directory on disk.
 */
async function extractZipToTempDir(zipBuffer: Buffer): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `lubelog-import-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  const zip = await JSZip.loadAsync(zipBuffer);

  for (const [relativePath, entry] of Object.entries(zip.files)) {
    const targetPath = path.join(tmpDir, relativePath);
    if (entry.dir) {
      await mkdir(targetPath, { recursive: true });
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true });
      const content = await entry.async("nodebuffer");
      await writeFile(targetPath, content);
    }
  }

  return tmpDir;
}

// ── API Route ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, userId } = ctx;
  let tmpDir: string | null = null;

  try {
    // Accept the zip as raw binary body
    const arrayBuffer = await request.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    if (zipBuffer.length < 100) {
      return NextResponse.json(
        { error: "Uploaded file is too small to be a valid backup" },
        { status: 400 }
      );
    }

    // Extract zip to temp directory
    tmpDir = await extractZipToTempDir(zipBuffer);

    // Resolve and validate the backup directory
    let backupDir: string;
    try {
      backupDir = await resolveBackupDir(tmpDir);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid backup" },
        { status: 400 }
      );
    }

    // Read the LiteDB file
    const dbPath = path.join(backupDir, "data", "cartracker.db");
    const dbBuffer = readFileSync(dbPath);

    // Parse LiteDB BSON documents
    const allDocs = extractBsonDocuments(dbBuffer);
    const { vehicles, serviceRecords, notes } = classifyDocuments(allDocs);

    if (vehicles.length === 0) {
      return NextResponse.json(
        { error: "No vehicles found in the LubeLog backup" },
        { status: 400 }
      );
    }

    // Get invoice prefix settings
    const prefixSetting = await db.appSetting.findFirst({
      where: { organizationId, key: "workshop.invoicePrefix" },
    });
    const invoicePrefix = resolveInvoicePrefix(
      prefixSetting?.value || "{year}-"
    );

    // Get the current highest invoice number to continue the sequence
    const lastRecord = await db.serviceRecord.findFirst({
      where: { vehicle: { organizationId } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });
    let nextInvoiceNum = 1001;
    if (lastRecord?.invoiceNumber) {
      const match = lastRecord.invoiceNumber.match(/(\d+)$/);
      if (match) nextInvoiceNum = Number.parseInt(match[1], 10) + 1;
    }

    // Map LubeLog vehicle IDs → Torqvoice vehicle IDs
    const vehicleIdMap = new Map<number, string>();

    // Compute highest mileage per vehicle from service records
    const vehicleMileage = new Map<number, number>();
    for (const sr of serviceRecords) {
      const current = vehicleMileage.get(sr.VehicleId) || 0;
      if (sr.Mileage > current) vehicleMileage.set(sr.VehicleId, sr.Mileage);
    }

    // Uploads directory for this org
    const uploadsBase = path.join(
      process.cwd(),
      "data",
      "uploads",
      organizationId
    );

    // ── Copy a file from the backup to the uploads directory ──────────────
    async function copyFile(
      sourcePath: string,
      category: string,
      filename: string
    ): Promise<{ fileUrl: string; fileSize: number } | null> {
      const targetDir = path.join(uploadsBase, category);
      await mkdir(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, filename);

      // Normalize source paths: strip leading /
      const normalizedSource = sourcePath.replace(/^\//, "");
      const localPath = path.join(backupDir, normalizedSource);

      let fileData: Buffer;
      try {
        fileData = readFileSync(localPath);
      } catch {
        return null;
      }

      await writeFile(targetPath, fileData);
      const fileUrl = `/api/files/${organizationId}/${category}/${filename}`;
      return { fileUrl, fileSize: fileData.length };
    }

    // ── Database transaction ─────────────────────────────────────────────
    await db.$transaction(async (tx) => {
      // Create vehicles
      for (const v of vehicles) {
        let imageUrl: string | null = null;

        if (v.ImageLocation) {
          const ext = v.ImageLocation.split(".").pop() || "jpg";
          const filename = `lubelog-vehicle-${v._id}.${ext}`;
          const result = await copyFile(
            v.ImageLocation,
            "vehicles",
            filename
          );
          if (result) imageUrl = result.fileUrl;
        }

        const created = await tx.vehicle.create({
          data: {
            make: v.Make,
            model: v.Model,
            year: v.Year,
            licensePlate: v.LicensePlate || null,
            fuelType: determineFuelType(v),
            mileage: vehicleMileage.get(v._id) || 0,
            purchasePrice: parseDecimal(v.PurchasePrice) || null,
            imageUrl,
            userId,
            organizationId,
          },
        });

        vehicleIdMap.set(v._id, created.id);
      }

      // Create notes (grouped by vehicle)
      for (const n of notes) {
        const vehicleId = vehicleIdMap.get(n.VehicleId);
        if (!vehicleId) continue;

        await tx.note.create({
          data: {
            title: n.Description,
            content: n.NoteText,
            isPinned: n.Pinned || false,
            vehicleId,
          },
        });
      }

      // Create service records
      for (const sr of serviceRecords) {
        const vehicleId = vehicleIdMap.get(sr.VehicleId);
        if (!vehicleId) continue;

        const invoiceNumber = `${invoicePrefix}${nextInvoiceNum}`;
        nextInvoiceNum++;

        const cost = parseDecimal(sr.Cost);

        const created = await tx.serviceRecord.create({
          data: {
            title: sr.Description,
            description: sr.Notes || null,
            type: "repair",
            status: "completed",
            cost,
            mileage: sr.Mileage || null,
            serviceDate: new Date(sr.Date),
            invoiceNumber,
            subtotal: cost,
            totalAmount: cost,
            vehicleId,
          },
        });

        // Copy attached files
        if (sr.Files && sr.Files.length > 0) {
          for (const file of sr.Files) {
            if (!file.Location) continue;

            const safeName = file.Name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const filename = `lubelog-${sr._id}-${safeName}`;

            const result = await copyFile(
              file.Location,
              "services",
              filename
            );
            if (result) {
              await tx.serviceAttachment.create({
                data: {
                  fileName: file.Name,
                  fileUrl: result.fileUrl,
                  fileType: getMimeType(file.Name),
                  fileSize: result.fileSize,
                  category: file.Name.match(/\.(jpg|jpeg|png|webp)$/i)
                    ? "image"
                    : "diagnostic",
                  serviceRecordId: created.id,
                },
              });
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      imported: {
        vehicles: vehicles.length,
        serviceRecords: serviceRecords.length,
        notes: notes.length,
      },
    });
  } catch (error) {
    console.error("[import-lubelog] Error:", error);
    const message =
      error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Clean up temp directory
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => { /* ignore cleanup errors */ });
    }
  }
}
