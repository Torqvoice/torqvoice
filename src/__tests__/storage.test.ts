import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { uploadFile, getFileBuffer, deleteFile, copyFile, deleteOrganizationFiles, listOrganizationFiles } from "@/lib/storage";
import { getUploadBaseDir } from "@/lib/resolve-upload-path";
import { writeFile, mkdir, unlink, readFile, rm } from "fs/promises";
import path from "path";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("Storage Driver Engine", () => {
  const originalEnv = { ...process.env };
  const mockOrgId = "test-org-123";
  const mockFileContent = Buffer.from("hello world");

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_BUCKET;
    fetchMock.mockReset();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    // Cleanup local test files
    try {
      const testUploadsDir = path.join(getUploadBaseDir(), mockOrgId);
      await rm(testUploadsDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Local Disk Driver Mode", () => {
    it("should upload and read a file successfully on local disk", async () => {
      const url = await uploadFile("logos", "my-logo.png", mockFileContent, "image/png", mockOrgId);
      expect(url).toBe(`/api/protected/files/${mockOrgId}/logos/my-logo.png`);

      const buffer = await getFileBuffer(mockOrgId, "logos", "my-logo.png");
      expect(buffer.toString()).toBe("hello world");
    });

    it("should copy a file successfully on local disk", async () => {
      await uploadFile("quotes", "attachment.pdf", mockFileContent, "application/pdf", mockOrgId);
      await copyFile("quotes", "attachment.pdf", "services", "attachment.pdf", mockOrgId);

      const buffer = await getFileBuffer(mockOrgId, "services", "attachment.pdf");
      expect(buffer.toString()).toBe("hello world");
    });

    it("should delete a file successfully from local disk", async () => {
      const url = await uploadFile("vehicles", "car.jpg", mockFileContent, "image/jpeg", mockOrgId);
      await deleteFile(url);

      await expect(getFileBuffer(mockOrgId, "vehicles", "car.jpg")).rejects.toThrow();
    });

    it("should list filenames in a category on local disk", async () => {
      await uploadFile("inventory", "part1.png", mockFileContent, "image/png", mockOrgId);
      await uploadFile("inventory", "part2.png", mockFileContent, "image/png", mockOrgId);

      const files = await listOrganizationFiles(mockOrgId, "inventory");
      expect(files).toContain("part1.png");
      expect(files).toContain("part2.png");
    });
  });

  describe("Supabase Storage Driver Mode", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mockproject.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-secret-service-role-key";
      // Re-importing storage to re-evaluate isSupabaseEnabled
      // In ES modules we can just set it as enabled by updating the active check variables
    });

    it("should upload a file via Supabase Storage REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ Key: "test-org-123/logos/my-logo.png" }),
      });

      // Force enable Supabase for the mock test session
      const storageModule = await import("@/lib/storage");
      const url = await storageModule.uploadFile("logos", "my-logo.png", mockFileContent, "image/png", mockOrgId);

      expect(url).toBe(`/api/protected/files/${mockOrgId}/logos/my-logo.png`);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://mockproject.supabase.co/storage/v1/object/taller-uploads/test-org-123/logos/my-logo.png");
      expect(callArgs[1].method).toBe("POST");
      expect(callArgs[1].headers["Authorization"]).toBe("Bearer mock-secret-service-role-key");
      expect(callArgs[1].headers["x-upsert"]).toBe("true");
    });

    it("should download file buffer via Supabase Storage REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => {
          const ab = new ArrayBuffer(mockFileContent.length);
          const view = new Uint8Array(ab);
          view.set(mockFileContent);
          return ab;
        },
      });

      const storageModule = await import("@/lib/storage");
      const buffer = await storageModule.getFileBuffer(mockOrgId, "logos", "my-logo.png");

      expect(buffer.toString()).toBe("hello world");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://mockproject.supabase.co/storage/v1/object/authenticated/taller-uploads/test-org-123/logos/my-logo.png");
      expect(callArgs[1].headers["Authorization"]).toBe("Bearer mock-secret-service-role-key");
    });

    it("should delete a file via Supabase Storage REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      });

      const storageModule = await import("@/lib/storage");
      await storageModule.deleteFile(`/api/protected/files/${mockOrgId}/logos/my-logo.png`);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://mockproject.supabase.co/storage/v1/object/taller-uploads");
      expect(callArgs[1].method).toBe("DELETE");
      expect(JSON.parse(callArgs[1].body)).toEqual({ prefixes: ["test-org-123/logos/my-logo.png"] });
    });

    it("should copy a file inside Supabase Storage REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      });

      const storageModule = await import("@/lib/storage");
      await storageModule.copyFile("quotes", "attachment.pdf", "services", "attachment.pdf", mockOrgId);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://mockproject.supabase.co/storage/v1/object/copy");
      expect(callArgs[1].method).toBe("POST");
      expect(JSON.parse(callArgs[1].body)).toEqual({
        bucketId: "taller-uploads",
        sourceKey: "test-org-123/quotes/attachment.pdf",
        destinationKey: "test-org-123/services/attachment.pdf",
      });
    });

    it("should list organization filenames via Supabase Storage REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "part1.png" }, { name: "part2.png" }],
      });

      const storageModule = await import("@/lib/storage");
      const files = await storageModule.listOrganizationFiles(mockOrgId, "inventory");

      expect(files).toEqual(["part1.png", "part2.png"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://mockproject.supabase.co/storage/v1/object/list/taller-uploads");
      expect(callArgs[1].method).toBe("POST");
      expect(JSON.parse(callArgs[1].body).prefix).toBe("test-org-123/inventory/");
    });
  });
});
