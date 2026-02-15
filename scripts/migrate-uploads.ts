/**
 * Migration script: Move uploads from public/uploads/ to data/uploads/[orgId]/
 * and update all database references.
 *
 * This script:
 * 1. For each organization, creates data/uploads/[orgId]/vehicles|inventory|services|logos/
 * 2. Copies files from public/uploads/[category]/ to the correct org directory
 * 3. Updates imageUrl/fileUrl in the database from /uploads/[category]/file
 *    to /api/files/[orgId]/[category]/file
 * 4. Updates AppSetting logo URLs
 *
 * Usage:
 *   npx tsx scripts/migrate-uploads.ts
 *
 * Run this AFTER deploying the new code. The resolveUploadPath helper supports
 * both old and new URL formats, so the app works during the transition.
 */

import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir, stat } from "fs/promises";
import path from "path";

const db = new PrismaClient();

const PUBLIC_UPLOADS = path.join(process.cwd(), "public", "uploads");
const DATA_UPLOADS = path.join(process.cwd(), "data", "uploads");

function parseOldUrl(url: string): { category: string; filename: string } | null {
  // Match /uploads/category/filename
  const match = url.match(/^\/uploads\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { category: match[1], filename: match[2] };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Starting upload migration...\n");

  // Get all organizations
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  console.log(`Found ${orgs.length} organizations.\n`);

  // Create directories for each org
  for (const org of orgs) {
    for (const category of ["vehicles", "inventory", "services", "logos"]) {
      await mkdir(path.join(DATA_UPLOADS, org.id, category), { recursive: true });
    }
  }

  let totalMigrated = 0;
  let totalSkipped = 0;

  // 1. Migrate Vehicle images
  console.log("--- Migrating vehicle images ---");
  const vehicles = await db.vehicle.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true, organizationId: true },
  });

  for (const v of vehicles) {
    if (!v.imageUrl || v.imageUrl.startsWith("/api/files/") || !v.organizationId) continue;
    const parsed = parseOldUrl(v.imageUrl);
    if (!parsed) {
      console.log(`  [skip] Vehicle ${v.id}: unrecognized URL "${v.imageUrl}"`);
      totalSkipped++;
      continue;
    }

    const orgId = v.organizationId;
    const src = path.join(PUBLIC_UPLOADS, parsed.category, parsed.filename);
    const dst = path.join(DATA_UPLOADS, orgId, "vehicles", parsed.filename);
    const newUrl = `/api/files/${orgId}/vehicles/${parsed.filename}`;

    if (await fileExists(src)) {
      await copyFile(src, dst);
      await db.vehicle.update({ where: { id: v.id }, data: { imageUrl: newUrl } });
      console.log(`  [ok] Vehicle ${v.id}: ${v.imageUrl} -> ${newUrl}`);
      totalMigrated++;
    } else {
      console.log(`  [missing] Vehicle ${v.id}: source file not found "${src}"`);
      // Update URL anyway so it points to the new path format
      await db.vehicle.update({ where: { id: v.id }, data: { imageUrl: newUrl } });
      totalSkipped++;
    }
  }

  // 2. Migrate ServiceAttachment files
  console.log("\n--- Migrating service attachments ---");
  const attachments = await db.serviceAttachment.findMany({
    select: {
      id: true,
      fileUrl: true,
      serviceRecord: {
        select: { vehicle: { select: { organizationId: true } } },
      },
    },
  });

  for (const att of attachments) {
    if (att.fileUrl.startsWith("/api/files/")) continue;
    const parsed = parseOldUrl(att.fileUrl);
    if (!parsed) {
      console.log(`  [skip] Attachment ${att.id}: unrecognized URL "${att.fileUrl}"`);
      totalSkipped++;
      continue;
    }

    const orgId = att.serviceRecord.vehicle.organizationId;
    if (!orgId) continue;
    const src = path.join(PUBLIC_UPLOADS, parsed.category, parsed.filename);
    const dst = path.join(DATA_UPLOADS, orgId, "services", parsed.filename);
    const newUrl = `/api/files/${orgId}/services/${parsed.filename}`;

    if (await fileExists(src)) {
      await copyFile(src, dst);
      await db.serviceAttachment.update({ where: { id: att.id }, data: { fileUrl: newUrl } });
      console.log(`  [ok] Attachment ${att.id}: ${att.fileUrl} -> ${newUrl}`);
      totalMigrated++;
    } else {
      console.log(`  [missing] Attachment ${att.id}: source file not found "${src}"`);
      await db.serviceAttachment.update({ where: { id: att.id }, data: { fileUrl: newUrl } });
      totalSkipped++;
    }
  }

  // 3. Migrate InventoryPart images
  console.log("\n--- Migrating inventory images ---");
  const parts = await db.inventoryPart.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true, organizationId: true },
  });

  for (const p of parts) {
    if (!p.imageUrl || p.imageUrl.startsWith("/api/files/") || !p.organizationId) continue;
    const parsed = parseOldUrl(p.imageUrl);
    if (!parsed) {
      console.log(`  [skip] Part ${p.id}: unrecognized URL "${p.imageUrl}"`);
      totalSkipped++;
      continue;
    }

    const orgId = p.organizationId;
    const src = path.join(PUBLIC_UPLOADS, parsed.category, parsed.filename);
    const dst = path.join(DATA_UPLOADS, orgId, "inventory", parsed.filename);
    const newUrl = `/api/files/${orgId}/inventory/${parsed.filename}`;

    if (await fileExists(src)) {
      await copyFile(src, dst);
      await db.inventoryPart.update({ where: { id: p.id }, data: { imageUrl: newUrl } });
      console.log(`  [ok] Part ${p.id}: ${p.imageUrl} -> ${newUrl}`);
      totalMigrated++;
    } else {
      console.log(`  [missing] Part ${p.id}: source file not found "${src}"`);
      await db.inventoryPart.update({ where: { id: p.id }, data: { imageUrl: newUrl } });
      totalSkipped++;
    }
  }

  // 4. Migrate AppSetting logos
  console.log("\n--- Migrating logo settings ---");
  const logos = await db.appSetting.findMany({
    where: { key: "workshop.logo" },
    select: { id: true, value: true, organizationId: true },
  });

  for (const logo of logos) {
    if (logo.value.startsWith("/api/files/") || !logo.organizationId) continue;
    const parsed = parseOldUrl(logo.value);
    if (!parsed) {
      console.log(`  [skip] Logo setting ${logo.id}: unrecognized URL "${logo.value}"`);
      totalSkipped++;
      continue;
    }

    const orgId = logo.organizationId;
    const src = path.join(PUBLIC_UPLOADS, parsed.category, parsed.filename);
    const dst = path.join(DATA_UPLOADS, orgId, "logos", parsed.filename);
    const newUrl = `/api/files/${orgId}/logos/${parsed.filename}`;

    if (await fileExists(src)) {
      await copyFile(src, dst);
      await db.appSetting.update({ where: { id: logo.id }, data: { value: newUrl } });
      console.log(`  [ok] Logo ${logo.id}: ${logo.value} -> ${newUrl}`);
      totalMigrated++;
    } else {
      console.log(`  [missing] Logo ${logo.id}: source file not found "${src}"`);
      await db.appSetting.update({ where: { id: logo.id }, data: { value: newUrl } });
      totalSkipped++;
    }
  }

  console.log(`\nMigration complete! Migrated: ${totalMigrated}, Skipped: ${totalSkipped}`);
  console.log("\nYou can now safely remove public/uploads/ after verifying everything works.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
