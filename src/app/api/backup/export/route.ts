import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import JSZip from "jszip";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

export const maxDuration = 300;

interface ExportOptions {
  settings: boolean;
  customers: boolean;
  vehicles: boolean;
  quotes: boolean;
  inventory: boolean;
  customFields: boolean;
  files: boolean;
}

const DEFAULT_OPTIONS: ExportOptions = {
  settings: true,
  customers: true,
  vehicles: true,
  quotes: true,
  inventory: true,
  customFields: true,
  files: true,
};

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let options: ExportOptions = DEFAULT_OPTIONS;
  try {
    const body = await request.json();
    if (body?.include) {
      options = { ...DEFAULT_OPTIONS, ...body.include };
    }
  } catch {
    // If no body or invalid JSON, use defaults
  }

  const data: Record<string, unknown> = {};

  const queries: Promise<void>[] = [];

  if (options.settings) {
    queries.push(
      db.appSetting
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.settings = result;
        })
    );
  }

  if (options.customers) {
    queries.push(
      db.customer
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.customers = result;
        })
    );
  }

  if (options.customFields) {
    queries.push(
      db.customFieldDefinition
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: { values: true },
        })
        .then((result) => {
          data.customFieldDefinitions = result;
        })
    );
  }

  if (options.inventory) {
    queries.push(
      db.inventoryPart
        .findMany({ where: { organizationId: ctx.organizationId } })
        .then((result) => {
          data.inventoryParts = result;
        })
    );
  }

  if (options.vehicles) {
    queries.push(
      db.vehicle
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            notes: true,
            fuelLogs: true,
            reminders: true,
            serviceRecords: {
              include: {
                partItems: true,
                laborItems: true,
                attachments: true,
                payments: true,
              },
            },
          },
        })
        .then((result) => {
          data.vehicles = result;
        })
    );
  }

  if (options.quotes) {
    queries.push(
      db.quote
        .findMany({
          where: { organizationId: ctx.organizationId },
          include: {
            partItems: true,
            laborItems: true,
          },
        })
        .then((result) => {
          data.quotes = result;
        })
    );
  }

  await Promise.all(queries);

  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    data,
  };

  const zip = new JSZip();

  // Add data.json
  zip.file("data.json", JSON.stringify(backup, null, 2));

  // Add uploaded files if requested
  if (options.files) {
    const uploadsDir = path.join(
      process.cwd(),
      "data",
      "uploads",
      ctx.organizationId
    );

    const categories = ["logos", "vehicles", "inventory", "services"];

    for (const category of categories) {
      const categoryDir = path.join(uploadsDir, category);
      try {
        const dirStat = await stat(categoryDir);
        if (!dirStat.isDirectory()) continue;

        const files = await readdir(categoryDir);
        for (const file of files) {
          const filePath = path.join(categoryDir, file);
          const fileStat = await stat(filePath);
          if (!fileStat.isFile()) continue;

          const fileBuffer = await readFile(filePath);
          zip.file(`files/${category}/${file}`, fileBuffer);
        }
      } catch {
        // Category directory doesn't exist, skip
      }
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  const dateStr = new Date().toISOString().slice(0, 10);
  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="torqvoice-backup-${dateStr}.zip"`,
    },
  });
}

// Keep GET for backward compatibility — exports all data as zip with defaults
export async function GET() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, customers, customFieldDefinitions, inventoryParts, vehicles, quotes] =
    await Promise.all([
      db.appSetting.findMany({ where: { organizationId: ctx.organizationId } }),
      db.customer.findMany({ where: { organizationId: ctx.organizationId } }),
      db.customFieldDefinition.findMany({
        where: { organizationId: ctx.organizationId },
        include: { values: true },
      }),
      db.inventoryPart.findMany({ where: { organizationId: ctx.organizationId } }),
      db.vehicle.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          notes: true,
          fuelLogs: true,
          reminders: true,
          serviceRecords: {
            include: {
              partItems: true,
              laborItems: true,
              attachments: true,
              payments: true,
            },
          },
        },
      }),
      db.quote.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          partItems: true,
          laborItems: true,
        },
      }),
    ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      customers,
      customFieldDefinitions,
      inventoryParts,
      vehicles,
      quotes,
    },
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="torqvoice-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
