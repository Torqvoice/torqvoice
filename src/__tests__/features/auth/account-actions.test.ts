import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cached-session for withAuth
vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    verification: {
      upsert: vi.fn(),
    },
  },
}));

// Mock email
vi.mock("@/lib/email", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  getFromAddress: vi.fn().mockResolvedValue("noreply@test.com"),
}));

import { updateEmail, requestEmailChange } from "@/features/settings/Actions/accountActions";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";

const mockGetCachedSession = vi.mocked(getCachedSession);
const mockGetCachedMembership = vi.mocked(getCachedMembership);
const mockFindUnique = vi.mocked(db.user.findUnique);
const mockFindFirst = vi.mocked(db.user.findFirst);
const mockUpdate = vi.mocked(db.user.update);
const mockUpsert = vi.mocked(db.verification.upsert);

const SESSION = { user: { id: "user-1", email: "user@example.com" } };
const MEMBERSHIP = {
  organizationId: "org-1",
  role: "admin",
  roleId: null,
  customRole: null,
};

function setupAuth() {
  mockGetCachedSession.mockResolvedValue(SESSION as any);
  mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
  mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("updateEmail", () => {
  it("returns Unauthorized when no session", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    const result = await updateEmail({ email: "new@example.com" });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns validation error for invalid email", async () => {
    setupAuth();
    const result = await updateEmail({ email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("email");
  });

  it("returns error when email is already in use", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue({ id: "other-user" } as any);
    const result = await updateEmail({ email: "taken@example.com" });
    expect(result).toEqual({ success: false, error: "Email is already in use" });
  });

  it("updates email and sets emailVerified=false on success", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({} as any);

    const result = await updateEmail({ email: "new@example.com" });
    expect(result).toEqual({ success: true, data: { email: "new@example.com" } });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "new@example.com", emailVerified: false },
    });
  });
});

describe("requestEmailChange", () => {
  it("returns Unauthorized when no session", async () => {
    mockGetCachedSession.mockResolvedValue(null);
    const result = await requestEmailChange({ email: "new@example.com" });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns validation error for invalid email", async () => {
    setupAuth();
    const result = await requestEmailChange({ email: "bad-email" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("email");
  });

  it("returns error when email is already in use", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue({ id: "other-user" } as any);
    const result = await requestEmailChange({ email: "taken@example.com" });
    expect(result).toEqual({ success: false, error: "Email is already in use" });
  });

  it("returns error when user not found", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue(null);
    // findUnique is called twice: once by withAuth (isSuperAdmin), once by requestEmailChange (user lookup)
    // First call returns isSuperAdmin check, second returns null for user
    mockFindUnique
      .mockResolvedValueOnce({ isSuperAdmin: false } as any)
      .mockResolvedValueOnce(null);
    const result = await requestEmailChange({ email: "new@example.com" });
    expect(result).toEqual({ success: false, error: "User not found" });
  });

  it("generates token, stores hash, and sends email to the new address", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue(null);
    // Second findUnique call returns user data
    mockFindUnique
      .mockResolvedValueOnce({ isSuperAdmin: false } as any)
      .mockResolvedValueOnce({ name: "Test User", email: "user@example.com" } as any);
    mockUpsert.mockResolvedValue({} as any);

    const result = await requestEmailChange({ email: "new@example.com" });
    expect(result).toEqual({ success: true, data: { sent: true } });

    // Verify upsert was called with the correct identifier pattern
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identifier: "email-change:user-1" },
        create: expect.objectContaining({
          identifier: "email-change:user-1",
        }),
      }),
    );

    // Verify the stored value contains tokenHash and email
    const upsertCall = mockUpsert.mock.calls[0][0];
    const storedValue = JSON.parse(upsertCall.create.value as string);
    expect(storedValue).toHaveProperty("tokenHash");
    expect(storedValue).toHaveProperty("email", "new@example.com");

    // Verify email was sent to the NEW address
    const { sendMail } = await import("@/lib/email");
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@example.com",
        from: "noreply@test.com",
      }),
    );
  });

  it("uses upsert to replace any existing pending change for the user", async () => {
    setupAuth();
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique
      .mockResolvedValueOnce({ isSuperAdmin: false } as any)
      .mockResolvedValueOnce({ name: "User", email: "user@example.com" } as any);
    mockUpsert.mockResolvedValue({} as any);

    await requestEmailChange({ email: "new@example.com" });

    // Upsert ensures only one pending change per user
    const upsertCall = mockUpsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ identifier: "email-change:user-1" });
    expect(upsertCall.update).toBeDefined();
    const updateValue = JSON.parse(upsertCall.update.value as string);
    expect(updateValue.email).toBe("new@example.com");
  });
});
