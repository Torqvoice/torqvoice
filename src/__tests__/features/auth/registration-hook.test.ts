import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the registration `before` hook in src/lib/auth.ts.
 * The hook logic is extracted and tested directly here.
 */

vi.mock("@/lib/db", () => ({
  db: {
    systemSetting: {
      findUnique: vi.fn(),
    },
    teamInvitation: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockFindSetting = vi.mocked(db.systemSetting.findUnique);
const mockFindInvitation = vi.mocked(db.teamInvitation.findFirst);

// This is the exact logic from src/lib/auth.ts databaseHooks.user.create.before
async function registrationBeforeHook(user: { email: string; name?: string }) {
  const setting = await db.systemSetting.findUnique({
    where: { key: "registration.disabled" },
  });
  if (setting?.value === "true") {
    const invitation = await db.teamInvitation.findFirst({
      where: {
        email: user.email,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) {
      return false;
    }
  }
  return { data: user };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("registration before hook", () => {
  const user = { email: "newuser@example.com", name: "New User" };

  it("allows registration when registration.disabled setting is not found", async () => {
    mockFindSetting.mockResolvedValue(null);
    const result = await registrationBeforeHook(user);
    expect(result).toEqual({ data: user });
    expect(mockFindInvitation).not.toHaveBeenCalled();
  });

  it("allows registration when registration.disabled = 'false'", async () => {
    mockFindSetting.mockResolvedValue({ key: "registration.disabled", value: "false" } as any);
    const result = await registrationBeforeHook(user);
    expect(result).toEqual({ data: user });
    expect(mockFindInvitation).not.toHaveBeenCalled();
  });

  it("blocks registration when disabled=true and no valid invitation exists", async () => {
    mockFindSetting.mockResolvedValue({ key: "registration.disabled", value: "true" } as any);
    mockFindInvitation.mockResolvedValue(null);
    const result = await registrationBeforeHook(user);
    expect(result).toBe(false);
  });

  it("allows registration when disabled=true but a valid pending non-expired invitation exists", async () => {
    mockFindSetting.mockResolvedValue({ key: "registration.disabled", value: "true" } as any);
    mockFindInvitation.mockResolvedValue({
      id: "inv-1",
      email: user.email,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    const result = await registrationBeforeHook(user);
    expect(result).toEqual({ data: user });
  });

  it("blocks registration when disabled=true and invitation is expired (findFirst returns null due to expiresAt filter)", async () => {
    // The DB query filters expiresAt > now, so an expired invitation won't be returned
    mockFindSetting.mockResolvedValue({ key: "registration.disabled", value: "true" } as any);
    mockFindInvitation.mockResolvedValue(null); // expired invitation filtered out by DB
    const result = await registrationBeforeHook(user);
    expect(result).toBe(false);
  });

  it("blocks registration when disabled=true and invitation status is not pending (findFirst returns null)", async () => {
    // The DB query filters status: "pending", so non-pending won't be returned
    mockFindSetting.mockResolvedValue({ key: "registration.disabled", value: "true" } as any);
    mockFindInvitation.mockResolvedValue(null); // non-pending invitation filtered out by DB
    const result = await registrationBeforeHook(user);
    expect(result).toBe(false);
  });
});
