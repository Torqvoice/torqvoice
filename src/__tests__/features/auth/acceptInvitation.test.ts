import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
  }),
}));

// Mock auth — acceptInvitation calls auth.api.getSession directly
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    teamInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { acceptInvitation } from "@/features/team/Actions/acceptInvitation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

const mockGetSession = vi.mocked(auth.api.getSession);
const mockFindInvitation = vi.mocked(db.teamInvitation.findUnique);
const mockFindMembership = vi.mocked(db.organizationMember.findFirst);
const mockUpdateInvitation = vi.mocked(db.teamInvitation.update);
const mockTransaction = vi.mocked(db.$transaction);

const SESSION = { user: { id: "user-1", email: "invited@example.com" } };
const VALID_INVITATION = {
  id: "inv-1",
  token: "tok-abc",
  email: "invited@example.com",
  organizationId: "org-1",
  status: "pending",
  role: "member",
  roleId: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days future
};

beforeEach(() => {
  vi.resetAllMocks();
  // Restore cookies mock after reset
  vi.mocked(cookies).mockResolvedValue({ set: vi.fn(), get: vi.fn() } as any);
});

describe("acceptInvitation", () => {
  it("returns error when user is not signed in", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "You must be signed in to accept an invitation" });
  });

  it("returns error when invitation is not found", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue(null);
    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "Invitation not found" });
  });

  it("returns error when invitation status is not pending", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue({ ...VALID_INVITATION, status: "accepted" } as any);
    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "This invitation is no longer valid" });
  });

  it("returns error when invitation is expired", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue({
      ...VALID_INVITATION,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    } as any);
    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "This invitation has expired" });
  });

  it("returns error when email does not match signed-in user", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "other@example.com" } } as any);
    mockFindInvitation.mockResolvedValue(VALID_INVITATION as any);
    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "This invitation was sent to a different email address" });
  });

  it("marks invitation accepted and returns success when user is already a member", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue(VALID_INVITATION as any);
    mockFindMembership.mockResolvedValue({ id: "mem-1" } as any);
    mockUpdateInvitation.mockResolvedValue({} as any);

    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: true, data: { accepted: true } });
    expect(mockUpdateInvitation).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted" },
    });
  });

  it("creates membership and marks invitation accepted in transaction on happy path", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue(VALID_INVITATION as any);
    mockFindMembership.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([{}, {}] as any);

    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: true, data: { accepted: true } });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns error when transaction throws", async () => {
    mockGetSession.mockResolvedValue(SESSION as any);
    mockFindInvitation.mockResolvedValue(VALID_INVITATION as any);
    mockFindMembership.mockResolvedValue(null);
    mockTransaction.mockRejectedValue(new Error("DB error"));

    const result = await acceptInvitation({ token: "tok-abc" });
    expect(result).toEqual({ success: false, error: "DB error" });
  });
});
