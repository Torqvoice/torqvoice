import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getUploadBaseDir } from "@/lib/resolve-upload-path";
import path from "path";

describe("getUploadBaseDir resolution logic", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test to ensure isolation
    delete process.env.UPLOAD_DIR;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  it("should resolve to local directory by default when no variables are set", () => {
    const base = getUploadBaseDir();
    expect(base).toBe(path.join(process.cwd(), "data", "uploads"));
  });

  it("should resolve to /tmp/data/uploads when running on Vercel", () => {
    process.env.VERCEL = "1";
    const base = getUploadBaseDir();
    expect(base).toBe("/tmp/data/uploads");
  });

  it("should resolve to UPLOAD_DIR when it is explicitly configured", () => {
    process.env.UPLOAD_DIR = "/var/custom-storage";
    const base = getUploadBaseDir();
    expect(base).toBe("/var/custom-storage");
  });

  it("should prioritize UPLOAD_DIR over VERCEL detection if both are set", () => {
    process.env.VERCEL = "1";
    process.env.UPLOAD_DIR = "/var/custom-storage";
    const base = getUploadBaseDir();
    expect(base).toBe("/var/custom-storage");
  });
});
