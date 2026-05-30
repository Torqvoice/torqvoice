import { writeFile, mkdir, unlink, readFile, rm, readdir, stat, copyFile as fsCopyFile } from "fs/promises";
import path from "path";
import { getUploadBaseDir } from "./resolve-upload-path";

export function getSupabaseConfig() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  // Auto-clean URL: strip trailing slashes and /rest/v1 suffix if copied from Data API settings page
  url = url.trim().replace(/\/$/, "");
  url = url.replace(/\/rest\/v1$/, "");

  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "taller-uploads").trim();

  return {
    url,
    key,
    bucket,
    enabled: !!(url && key),
  };
}

// Parse url to extract organizationId, category and filename
function parseFileUrl(fileUrl: string) {
  let relative = "";
  if (fileUrl.startsWith("/api/protected/files/")) {
    relative = fileUrl.replace("/api/protected/files/", "");
  } else if (fileUrl.startsWith("/api/files/")) {
    relative = fileUrl.replace("/api/files/", "");
  }
  if (!relative) return null;
  const parts = relative.split("/");
  if (parts.length !== 3) return null;
  return { orgId: parts[0], category: parts[1], filename: parts[2] };
}

/**
 * Upload a file either to Supabase Storage or the Local Filesystem.
 * Returns the resolved server relative URL: `/api/protected/files/[orgId]/[category]/[filename]`
 */
export async function uploadFile(
  category: string,
  filename: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
  organizationId: string
): Promise<string> {
  const fileKey = `${organizationId}/${category}/${filename}`;
  const config = getSupabaseConfig();

  if (config.enabled) {
    const url = `${config.url}/storage/v1/object/${config.bucket}/${fileKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Storage] Supabase upload failed:", errorText);
      throw new Error(`Supabase upload failed: ${response.statusText} (${errorText})`);
    }

    return `/api/protected/files/${organizationId}/${category}/${filename}`;
  }

  // Local filesystem driver fallback
  const uploadDir = path.join(getUploadBaseDir(), organizationId, category);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  return `/api/protected/files/${organizationId}/${category}/${filename}`;
}

/**
 * Reads a file either from Supabase Storage or Local Filesystem as a Buffer.
 */
export async function getFileBuffer(orgId: string, category: string, filename: string): Promise<Buffer> {
  const fileKey = `${orgId}/${category}/${filename}`;
  const config = getSupabaseConfig();

  if (config.enabled) {
    const url = `${config.url}/storage/v1/object/authenticated/${config.bucket}/${fileKey}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Storage] Supabase download failed:", errorText);
      throw new Error(`Supabase download failed: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Local filesystem driver fallback
  const filePath = path.join(getUploadBaseDir(), orgId, category, filename);
  return readFile(filePath);
}

/**
 * Delete a file either from Supabase Storage or Local Filesystem.
 */
export async function deleteFile(fileUrl: string): Promise<void> {
  const info = parseFileUrl(fileUrl);
  if (!info) {
    // If it's a legacy or public path we resolve it normally and try to unlink
    try {
      const { resolveUploadPath } = await import("./resolve-upload-path");
      const localPath = resolveUploadPath(fileUrl);
      await unlink(localPath);
    } catch {
      // Best effort
    }
    return;
  }

  const { orgId, category, filename } = info;
  const fileKey = `${orgId}/${category}/${filename}`;
  const config = getSupabaseConfig();

  if (config.enabled) {
    const url = `${config.url}/storage/v1/object/${config.bucket}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [fileKey] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[Storage] Supabase deletion failed:", errorText);
    }
    return;
  }

  // Local filesystem driver fallback
  try {
    const filePath = path.join(getUploadBaseDir(), orgId, category, filename);
    await unlink(filePath);
  } catch {
    // Best effort
  }
}

/**
 * Copies a file inside the storage system (e.g. from quotes to services on conversion).
 */
export async function copyFile(
  srcCategory: string,
  srcFilename: string,
  destCategory: string,
  destFilename: string,
  organizationId: string
): Promise<void> {
  const sourceKey = `${organizationId}/${srcCategory}/${srcFilename}`;
  const destinationKey = `${organizationId}/${destCategory}/${destFilename}`;
  const config = getSupabaseConfig();

  if (config.enabled) {
    const url = `${config.url}/storage/v1/object/copy`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucketId: config.bucket,
        sourceKey,
        destinationKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Storage] Supabase copy failed:", errorText);
      throw new Error(`Supabase copy failed: ${response.statusText}`);
    }
    return;
  }

  // Local filesystem driver fallback
  const quotesDir = path.join(getUploadBaseDir(), organizationId, srcCategory);
  const servicesDir = path.join(getUploadBaseDir(), organizationId, destCategory);
  await mkdir(servicesDir, { recursive: true });

  const srcPath = path.join(quotesDir, srcFilename);
  const destPath = path.join(servicesDir, destFilename);
  await fsCopyFile(srcPath, destPath);
}

/**
 * Delete all files belonging to an organization.
 */
export async function deleteOrganizationFiles(organizationId: string): Promise<void> {
  const config = getSupabaseConfig();

  if (config.enabled) {
    const categories = ["logos", "vehicles", "inventory", "services", "quotes", "portal"];
    for (const category of categories) {
      try {
        const files = await listOrganizationFiles(organizationId, category);
        if (files.length > 0) {
          const fileKeys = files.map((file) => `${organizationId}/${category}/${file}`);
          const url = `${config.url}/storage/v1/object/${config.bucket}`;
          await fetch(url, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${config.key}`,
              apikey: config.key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prefixes: fileKeys }),
          });
        }
      } catch (err) {
        console.warn(`[Storage] Failed to delete Supabase category "${category}" for org:`, err);
      }
    }
    return;
  }

  // Local filesystem driver fallback
  try {
    const orgUploadDir = path.join(getUploadBaseDir(), organizationId);
    await rm(orgUploadDir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Lists all filenames in a category for an organization.
 */
export async function listOrganizationFiles(organizationId: string, category: string): Promise<string[]> {
  const prefix = `${organizationId}/${category}/`;
  const config = getSupabaseConfig();

  if (config.enabled) {
    const url = `${config.url}/storage/v1/object/list/${config.bucket}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Storage] Supabase list failed:", errorText);
      return [];
    }

    const items = (await response.json()) as Array<{ name: string }>;
    return items.map((item) => item.name).filter(Boolean);
  }

  // Local filesystem driver fallback
  const categoryDir = path.join(getUploadBaseDir(), organizationId, category);
  try {
    const dirStat = await stat(categoryDir);
    if (!dirStat.isDirectory()) return [];

    const files = await readdir(categoryDir);
    const filenames: string[] = [];
    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        filenames.push(file);
      }
    }
    return filenames;
  } catch {
    return [];
  }
}
