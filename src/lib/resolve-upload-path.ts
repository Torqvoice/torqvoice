import path from "path";

/**
 * Resolves a file URL stored in the database to an absolute file path on disk.
 *
 * Handles three URL formats:
 *  - New: /api/protected/files/[orgId]/[category]/[filename] → data/uploads/[orgId]/[category]/[filename]
 *  - Old: /api/files/[orgId]/[category]/[filename] → data/uploads/[orgId]/[category]/[filename]
 *  - Legacy: /uploads/[category]/[filename] → public/uploads/[category]/[filename]
 */
export function resolveUploadPath(fileUrl: string): string {
  if (fileUrl.startsWith("/api/protected/files/")) {
    // /api/protected/files/orgId/category/filename → data/uploads/orgId/category/filename
    const relative = fileUrl.replace("/api/protected/files/", "");
    return path.join(process.cwd(), "data", "uploads", relative);
  }

  if (fileUrl.startsWith("/api/files/")) {
    // /api/files/orgId/category/filename → data/uploads/orgId/category/filename
    const relative = fileUrl.replace("/api/files/", "");
    return path.join(process.cwd(), "data", "uploads", relative);
  }

  // Legacy: /uploads/category/filename → public/uploads/category/filename
  return path.join(process.cwd(), "public", fileUrl);
}
