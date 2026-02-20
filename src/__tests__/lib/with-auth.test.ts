import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

// Hoisted mocks
vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { withAuth } from "@/lib/with-auth";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";

const mockGetCachedSession = vi.mocked(getCachedSession);
const mockGetCachedMembership = vi.mocked(getCachedMembership);
const mockFindUnique = vi.mocked(db.user.findUnique);

const SESSION = { user: { id: "user-1", email: "user@example.com" } };
const MEMBERSHIP = {
  organizationId: "org-1",
  role: "member",
  roleId: null,
  customRole: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("withAuth", () => {
  it("returns Unauthorized when there is no session", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    const result = await withAuth(async () => "ok");
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns No organization found when user has no membership and is not super admin", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue(null);
    const result = await withAuth(async () => "ok");
    expect(result).toEqual({ success: false, error: "No organization found" });
  });

  it("super admin with no membership bypasses org requirement and organizationId is null", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    mockGetCachedMembership.mockResolvedValue(null);
    const result = await withAuth(async (ctx) => ctx);
    expect(result.success).toBe(true);
    expect((result.data as any).organizationId).toBeNull();
    expect((result.data as any).isSuperAdmin).toBe(true);
  });

  it("regular member with no required permissions — action runs", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);
    const result = await withAuth(async (ctx) => ctx);
    expect(result.success).toBe(true);
    expect((result.data as any).organizationId).toBe("org-1");
  });

  it("owner bypasses permission check", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue({ ...MEMBERSHIP, role: "owner" } as any);
    const result = await withAuth(async (ctx) => ctx, {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result.success).toBe(true);
  });

  it("admin bypasses permission check", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue({ ...MEMBERSHIP, role: "admin" } as any);
    const result = await withAuth(async (ctx) => ctx, {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result.success).toBe(true);
  });

  it("custom role user with isAdmin=true bypasses permission check", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue({
      ...MEMBERSHIP,
      roleId: "role-1",
      customRole: { isAdmin: true, permissions: [] },
    } as any);
    const result = await withAuth(async (ctx) => ctx, {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result.success).toBe(true);
  });

  it("custom role user with correct permissions — passes", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue({
      ...MEMBERSHIP,
      roleId: "role-1",
      customRole: {
        isAdmin: false,
        permissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
      },
    } as any);
    const result = await withAuth(async (ctx) => ctx, {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result.success).toBe(true);
  });

  it("custom role user missing required permissions — Insufficient permissions", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue({
      ...MEMBERSHIP,
      roleId: "role-1",
      customRole: {
        isAdmin: false,
        permissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }],
      },
    } as any);
    const result = await withAuth(async () => "ok", {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result).toEqual({ success: false, error: "Insufficient permissions" });
  });

  it("super admin bypasses all permission checks", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    mockGetCachedMembership.mockResolvedValue(null);
    const result = await withAuth(async (ctx) => ctx, {
      requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    });
    expect(result.success).toBe(true);
    expect((result.data as any).isSuperAdmin).toBe(true);
  });

  it("action throwing ZodError returns formatted field errors", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);

    const zodErr = new ZodError([
      { code: "too_small", path: ["email"], message: "Required", minimum: 1, type: "string", inclusive: true },
    ]);
    const result = await withAuth(async () => { throw zodErr; });
    expect(result.success).toBe(false);
    expect(result.error).toContain("email");
    expect(result.error).toContain("Required");
  });

  it("action throwing a generic Error returns the error message", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);
    const result = await withAuth(async () => { throw new Error("something went wrong"); });
    expect(result).toEqual({ success: false, error: "something went wrong" });
  });
});
