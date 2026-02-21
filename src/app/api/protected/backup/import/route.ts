import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import JSZip from "jszip";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";

// Zip magic bytes: PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function isZipBuffer(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  if (view.length < 4) return false;
  return ZIP_MAGIC.every((byte, i) => view[i] === byte);
}

interface BackupData {
  version: number;
  data: Record<string, any>;
}

async function parseBackup(
  request: NextRequest
): Promise<{ backup: BackupData; files: JSZip | null }> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const backup = await request.json();
    return { backup, files: null };
  }

  // For any other content type, read as binary and detect format
  const buffer = await request.arrayBuffer();

  if (isZipBuffer(buffer)) {
    const zip = await JSZip.loadAsync(buffer);
    const dataJsonFile = zip.file("data.json");
    if (!dataJsonFile) {
      throw new Error("Zip archive does not contain data.json");
    }
    const jsonStr = await dataJsonFile.async("string");
    const backup = JSON.parse(jsonStr);
    return { backup, files: zip };
  }

  // Try parsing as JSON (e.g. if content-type header is wrong)
  const text = new TextDecoder().decode(buffer);
  const backup = JSON.parse(text);
  return { backup, files: null };
}

async function restoreFiles(zip: JSZip, organizationId: string) {
  const uploadsDir = path.join(
    process.cwd(),
    "data",
    "uploads",
    organizationId
  );

  // Clear existing uploads for this org
  try {
    await rm(uploadsDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }

  const allowedCategories = ["logos", "vehicles", "inventory", "services"];

  const fileEntries = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir && (name.startsWith("files/") || name.startsWith("uploads/"))
  );

  for (const filePath of fileEntries) {
    // Supports both formats:
    //   files/{category}/{filename}  (v2 backup)
    //   uploads/{category}/{filename} (legacy backup)
    const parts = filePath.split("/");
    if (parts.length !== 3) continue;

    const category = parts[1];
    const filename = parts[2];

    if (!allowedCategories.includes(category)) continue;

    // Prevent directory traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    )
      continue;

    const targetDir = path.join(uploadsDir, category);
    await mkdir(targetDir, { recursive: true });

    const fileData = await zip.files[filePath].async("nodebuffer");
    await writeFile(path.join(targetDir, filename), fileData);
  }
}

/** Rewrite file URLs to use the importing org's ID */
function rewriteFileUrl(
  url: string | null | undefined,
  newOrgId: string
): string | null {
  if (!url) return null;
  // New format: /api/protected/files/OLD_ORG_ID/category/filename
  if (url.startsWith("/api/protected/files/")) {
    return url.replace(/^\/api\/protected\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`);
  }
  // Old format (pre-restructure): /api/files/OLD_ORG_ID/category/filename
  if (url.startsWith("/api/files/")) {
    return url.replace(/^\/api\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`);
  }
  // Legacy format: /uploads/category/filename → convert to new format
  if (url.startsWith("/uploads/")) {
    const relative = url.replace(/^\/uploads\//, "");
    return `/api/protected/files/${newOrgId}/${relative}`;
  }
  return url;
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let backup: BackupData;
  let zipFiles: JSZip | null = null;

  try {
    const result = await parseBackup(request);
    backup = result.backup;
    zipFiles = result.files;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid backup file";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!backup?.version || (backup.version !== 1 && backup.version !== 2)) {
    return NextResponse.json(
      { error: "Unsupported or missing backup version" },
      { status: 400 }
    );
  }

  const data = backup.data;
  if (!data) {
    return NextResponse.json(
      { error: "No data found in backup" },
      { status: 400 }
    );
  }

  try {
    await db.$transaction(async (tx) => {
      // 1. Delete all existing organization data (cascade handles children)
      await tx.quote.deleteMany({
        where: { organizationId: ctx.organizationId },
      });
      await tx.vehicle.deleteMany({
        where: { organizationId: ctx.organizationId },
      });
      await tx.customFieldDefinition.deleteMany({
        where: { organizationId: ctx.organizationId },
      });
      await tx.inventoryPart.deleteMany({
        where: { organizationId: ctx.organizationId },
      });
      await tx.customer.deleteMany({
        where: { organizationId: ctx.organizationId },
      });
      await tx.appSetting.deleteMany({
        where: { organizationId: ctx.organizationId },
      });

      // 2. Insert settings
      if (data.settings?.length) {
        await tx.appSetting.createMany({
          data: (data.settings as Record<string, unknown>[]).map(
            (s: Record<string, unknown>) => {
              let value = s.value as string;
              // Rewrite file URLs in settings (e.g. logo paths)
              if (value?.startsWith("/api/protected/files/") || value?.startsWith("/api/files/")) {
                value = rewriteFileUrl(value, ctx.organizationId) || value;
              }
              return {
                id: s.id as string,
                key: s.key as string,
                value,
                userId: ctx.userId,
                organizationId: ctx.organizationId,
              };
            }
          ),
        });
      }

      // 3. Insert customers
      if (data.customers?.length) {
        await tx.customer.createMany({
          data: (data.customers as Record<string, unknown>[]).map(
            (c: Record<string, unknown>) => ({
              id: c.id as string,
              name: c.name as string,
              email: (c.email as string) || null,
              phone: (c.phone as string) || null,
              address: (c.address as string) || null,
              company: (c.company as string) || null,
              notes: (c.notes as string) || null,
              createdAt: c.createdAt
                ? new Date(c.createdAt as string)
                : undefined,
              updatedAt: c.updatedAt
                ? new Date(c.updatedAt as string)
                : undefined,
              userId: ctx.userId,
              organizationId: ctx.organizationId,
            })
          ),
        });
      }

      // 4. Insert custom field definitions
      if (data.customFieldDefinitions?.length) {
        for (const def of data.customFieldDefinitions as Record<
          string,
          unknown
        >[]) {
          await tx.customFieldDefinition.create({
            data: {
              id: def.id as string,
              name: def.name as string,
              label: def.label as string,
              fieldType: (def.fieldType as string) || "text",
              options: (def.options as string) || null,
              required: (def.required as boolean) || false,
              entityType: def.entityType as string,
              sortOrder: (def.sortOrder as number) || 0,
              isActive: def.isActive !== false,
              createdAt: def.createdAt
                ? new Date(def.createdAt as string)
                : undefined,
              updatedAt: def.updatedAt
                ? new Date(def.updatedAt as string)
                : undefined,
              userId: ctx.userId,
              organizationId: ctx.organizationId,
            },
          });

          // Insert associated custom field values
          const values = def.values as Record<string, unknown>[] | undefined;
          if (values?.length) {
            await tx.customFieldValue.createMany({
              data: values.map((v) => ({
                id: v.id as string,
                value: v.value as string,
                entityId: v.entityId as string,
                entityType: v.entityType as string,
                fieldId: def.id as string,
              })),
            });
          }
        }
      }

      // 5. Insert inventory parts
      if (data.inventoryParts?.length) {
        await tx.inventoryPart.createMany({
          data: (data.inventoryParts as Record<string, unknown>[]).map(
            (p: Record<string, unknown>) => ({
              id: p.id as string,
              partNumber: (p.partNumber as string) || null,
              name: p.name as string,
              description: (p.description as string) || null,
              category: (p.category as string) || null,
              quantity: (p.quantity as number) || 0,
              minQuantity: (p.minQuantity as number) || 0,
              unitCost: (p.unitCost as number) || 0,
              supplier: (p.supplier as string) || null,
              supplierPhone: (p.supplierPhone as string) || null,
              supplierEmail: (p.supplierEmail as string) || null,
              supplierUrl: (p.supplierUrl as string) || null,
              imageUrl: rewriteFileUrl(p.imageUrl as string, ctx.organizationId),
              location: (p.location as string) || null,
              isArchived: (p.isArchived as boolean) || false,
              createdAt: p.createdAt
                ? new Date(p.createdAt as string)
                : undefined,
              updatedAt: p.updatedAt
                ? new Date(p.updatedAt as string)
                : undefined,
              userId: ctx.userId,
              organizationId: ctx.organizationId,
            })
          ),
        });
      }

      // 6. Insert vehicles with nested data
      if (data.vehicles?.length) {
        for (const v of data.vehicles as Record<string, unknown>[]) {
          await tx.vehicle.create({
            data: {
              id: v.id as string,
              make: v.make as string,
              model: v.model as string,
              year: v.year as number,
              vin: (v.vin as string) || null,
              licensePlate: (v.licensePlate as string) || null,
              color: (v.color as string) || null,
              mileage: (v.mileage as number) || 0,
              fuelType: (v.fuelType as string) || null,
              transmission: (v.transmission as string) || null,
              engineSize: (v.engineSize as string) || null,
              purchaseDate: v.purchaseDate
                ? new Date(v.purchaseDate as string)
                : null,
              purchasePrice: (v.purchasePrice as number) || null,
              imageUrl: rewriteFileUrl(v.imageUrl as string, ctx.organizationId),
              isArchived: (v.isArchived as boolean) || false,
              createdAt: v.createdAt
                ? new Date(v.createdAt as string)
                : undefined,
              updatedAt: v.updatedAt
                ? new Date(v.updatedAt as string)
                : undefined,
              userId: ctx.userId,
              organizationId: ctx.organizationId,
              customerId: (v.customerId as string) || null,
            },
          });

          // Notes
          const notes = v.notes as Record<string, unknown>[] | undefined;
          if (notes?.length) {
            await tx.note.createMany({
              data: notes.map((n) => ({
                id: n.id as string,
                title: n.title as string,
                content: n.content as string,
                isPinned: (n.isPinned as boolean) || false,
                createdAt: n.createdAt
                  ? new Date(n.createdAt as string)
                  : undefined,
                updatedAt: n.updatedAt
                  ? new Date(n.updatedAt as string)
                  : undefined,
                vehicleId: v.id as string,
              })),
            });
          }

          // Fuel logs
          const fuelLogs = v.fuelLogs as Record<string, unknown>[] | undefined;
          if (fuelLogs?.length) {
            await tx.fuelLog.createMany({
              data: fuelLogs.map((f) => ({
                id: f.id as string,
                date: f.date ? new Date(f.date as string) : undefined,
                mileage: f.mileage as number,
                gallons: f.gallons as number,
                pricePerGallon: f.pricePerGallon as number,
                totalCost: f.totalCost as number,
                isFillUp: f.isFillUp !== false,
                station: (f.station as string) || null,
                notes: (f.notes as string) || null,
                createdAt: f.createdAt
                  ? new Date(f.createdAt as string)
                  : undefined,
                updatedAt: f.updatedAt
                  ? new Date(f.updatedAt as string)
                  : undefined,
                vehicleId: v.id as string,
              })),
            });
          }

          // Reminders
          const reminders = v.reminders as
            | Record<string, unknown>[]
            | undefined;
          if (reminders?.length) {
            await tx.reminder.createMany({
              data: reminders.map((r) => ({
                id: r.id as string,
                title: r.title as string,
                description: (r.description as string) || null,
                dueDate: r.dueDate ? new Date(r.dueDate as string) : null,
                dueMileage: (r.dueMileage as number) || null,
                isCompleted: (r.isCompleted as boolean) || false,
                createdAt: r.createdAt
                  ? new Date(r.createdAt as string)
                  : undefined,
                updatedAt: r.updatedAt
                  ? new Date(r.updatedAt as string)
                  : undefined,
                vehicleId: v.id as string,
              })),
            });
          }

          // Service records
          const serviceRecords = v.serviceRecords as
            | Record<string, unknown>[]
            | undefined;
          if (serviceRecords?.length) {
            for (const sr of serviceRecords) {
              await tx.serviceRecord.create({
                data: {
                  id: sr.id as string,
                  title: sr.title as string,
                  description: (sr.description as string) || null,
                  type: (sr.type as string) || "maintenance",
                  status: (sr.status as string) || "completed",
                  cost: (sr.cost as number) || 0,
                  mileage: (sr.mileage as number) || null,
                  serviceDate: sr.serviceDate
                    ? new Date(sr.serviceDate as string)
                    : undefined,
                  shopName: (sr.shopName as string) || null,
                  techName: (sr.techName as string) || null,
                  parts: (sr.parts as string) || null,
                  laborHours: (sr.laborHours as number) || null,
                  diagnosticNotes: (sr.diagnosticNotes as string) || null,
                  invoiceNotes: (sr.invoiceNotes as string) || null,
                  subtotal: (sr.subtotal as number) || 0,
                  taxRate: (sr.taxRate as number) || 0,
                  taxAmount: (sr.taxAmount as number) || 0,
                  totalAmount: (sr.totalAmount as number) || 0,
                  invoiceNumber: (sr.invoiceNumber as string) || null,
                  discountType: (sr.discountType as string) || null,
                  discountValue: (sr.discountValue as number) || 0,
                  discountAmount: (sr.discountAmount as number) || 0,
                  publicToken: (sr.publicToken as string) || null,
                  createdAt: sr.createdAt
                    ? new Date(sr.createdAt as string)
                    : undefined,
                  updatedAt: sr.updatedAt
                    ? new Date(sr.updatedAt as string)
                    : undefined,
                  vehicleId: v.id as string,
                },
              });

              // Service parts
              const partItems = sr.partItems as
                | Record<string, unknown>[]
                | undefined;
              if (partItems?.length) {
                await tx.servicePart.createMany({
                  data: partItems.map((p) => ({
                    id: p.id as string,
                    partNumber: (p.partNumber as string) || null,
                    name: p.name as string,
                    quantity: (p.quantity as number) || 1,
                    unitPrice: (p.unitPrice as number) || 0,
                    total: (p.total as number) || 0,
                    serviceRecordId: sr.id as string,
                  })),
                });
              }

              // Service labor
              const laborItems = sr.laborItems as
                | Record<string, unknown>[]
                | undefined;
              if (laborItems?.length) {
                await tx.serviceLabor.createMany({
                  data: laborItems.map((l) => ({
                    id: l.id as string,
                    description: l.description as string,
                    hours: (l.hours as number) || 0,
                    rate: (l.rate as number) || 0,
                    total: (l.total as number) || 0,
                    serviceRecordId: sr.id as string,
                  })),
                });
              }

              // Service attachments
              const attachments = sr.attachments as
                | Record<string, unknown>[]
                | undefined;
              if (attachments?.length) {
                await tx.serviceAttachment.createMany({
                  data: attachments.map((a) => ({
                    id: a.id as string,
                    fileName: a.fileName as string,
                    fileUrl: rewriteFileUrl(a.fileUrl as string, ctx.organizationId) || (a.fileUrl as string),
                    fileType: a.fileType as string,
                    fileSize: (a.fileSize as number) || 0,
                    category: (a.category as string) || "diagnostic",
                    description: (a.description as string) || null,
                    includeInInvoice: a.includeInInvoice !== false,
                    createdAt: a.createdAt
                      ? new Date(a.createdAt as string)
                      : undefined,
                    serviceRecordId: sr.id as string,
                  })),
                });
              }

              // Payments
              const payments = sr.payments as
                | Record<string, unknown>[]
                | undefined;
              if (payments?.length) {
                await tx.payment.createMany({
                  data: payments.map((p) => ({
                    id: p.id as string,
                    amount: p.amount as number,
                    date: p.date ? new Date(p.date as string) : undefined,
                    method: (p.method as string) || "other",
                    note: (p.note as string) || null,
                    createdAt: p.createdAt
                      ? new Date(p.createdAt as string)
                      : undefined,
                    updatedAt: p.updatedAt
                      ? new Date(p.updatedAt as string)
                      : undefined,
                    serviceRecordId: sr.id as string,
                  })),
                });
              }
            }
          }
        }
      }

      // 7. Insert quotes with nested data
      if (data.quotes?.length) {
        for (const q of data.quotes as Record<string, unknown>[]) {
          await tx.quote.create({
            data: {
              id: q.id as string,
              quoteNumber: (q.quoteNumber as string) || null,
              title: q.title as string,
              description: (q.description as string) || null,
              status: (q.status as string) || "draft",
              validUntil: q.validUntil
                ? new Date(q.validUntil as string)
                : null,
              subtotal: (q.subtotal as number) || 0,
              taxRate: (q.taxRate as number) || 0,
              taxAmount: (q.taxAmount as number) || 0,
              discountType: (q.discountType as string) || null,
              discountValue: (q.discountValue as number) || 0,
              discountAmount: (q.discountAmount as number) || 0,
              totalAmount: (q.totalAmount as number) || 0,
              notes: (q.notes as string) || null,
              convertedToId: (q.convertedToId as string) || null,
              createdAt: q.createdAt
                ? new Date(q.createdAt as string)
                : undefined,
              updatedAt: q.updatedAt
                ? new Date(q.updatedAt as string)
                : undefined,
              userId: ctx.userId,
              organizationId: ctx.organizationId,
              customerId: (q.customerId as string) || null,
              vehicleId: (q.vehicleId as string) || null,
            },
          });

          // Quote parts
          const partItems = q.partItems as
            | Record<string, unknown>[]
            | undefined;
          if (partItems?.length) {
            await tx.quotePart.createMany({
              data: partItems.map((p) => ({
                id: p.id as string,
                partNumber: (p.partNumber as string) || null,
                name: p.name as string,
                quantity: (p.quantity as number) || 1,
                unitPrice: (p.unitPrice as number) || 0,
                total: (p.total as number) || 0,
                quoteId: q.id as string,
              })),
            });
          }

          // Quote labor
          const laborItems = q.laborItems as
            | Record<string, unknown>[]
            | undefined;
          if (laborItems?.length) {
            await tx.quoteLabor.createMany({
              data: laborItems.map((l) => ({
                id: l.id as string,
                description: l.description as string,
                hours: (l.hours as number) || 0,
                rate: (l.rate as number) || 0,
                total: (l.total as number) || 0,
                quoteId: q.id as string,
              })),
            });
          }
        }
      }
    });

    // Restore files after successful DB transaction
    if (zipFiles) {
      await restoreFiles(zipFiles, ctx.organizationId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[backup/import] Error:", error);
    const message =
      error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
