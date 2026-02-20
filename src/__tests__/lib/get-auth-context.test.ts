import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { getAuthContext, getAuthContextDetailed } from "@/lib/get-auth-context";
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

describe("getAuthContext", () => {
  it("returns null when unauthenticated", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns null when session exists but no membership and not super admin", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockGetCachedMembership.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns context when session and membership are present", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const ctx = await getAuthContext();
    expect(ctx).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      isSuperAdmin: false,
    });
  });
});

describe("getAuthContextDetailed", () => {
  it("returns unauthenticated when no session", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    expect(await getAuthContextDetailed()).toEqual({ status: "unauthenticated" });
  });

  it("returns no-organization when session exists but no membership and not super admin", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockGetCachedMembership.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    expect(await getAuthContextDetailed()).toEqual({ status: "no-organization" });
  });

  it("returns ok with context when membership is present", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    const result = await getAuthContextDetailed();
    expect(result).toEqual({
      status: "ok",
      context: {
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        isSuperAdmin: false,
      },
    });
  });

  it("super admin with no membership returns ok with role=super_admin and organizationId=null", async () => {
    mockGetCachedSession.mockResolvedValue(SESSION as any);
    mockGetCachedMembership.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({ isSuperAdmin: true } as any);
    const result = await getAuthContextDetailed();
    expect(result).toEqual({
      status: "ok",
      context: {
        userId: "user-1",
        organizationId: null,
        role: "super_admin",
        isSuperAdmin: true,
      },
    });
  });
});
