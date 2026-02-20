/**
 * Team invitation isolation & role-correctness tests
 *
 * Verifies that:
 *  1. acceptInvitation creates memberships in the correct org with the correct role
 *  2. sendInvitation cannot be used to embed a cross-org custom roleId
 *  3. cancelInvitation is properly scoped to the caller's org
 *  4. getPendingInvitations only returns the caller's org's invitations
 *  5. assignRole cannot target members or roles from another org
 *  6. Custom isAdmin roles are respected by cancelInvitation and assignRole
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}));

vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    teamInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { acceptInvitation } from "@/features/team/Actions/acceptInvitation";
import { sendInvitation } from "@/features/team/Actions/sendInvitation";
import { cancelInvitation } from "@/features/team/Actions/cancelInvitation";
import { getPendingInvitations } from "@/features/team/Actions/getPendingInvitations";
import { assignRole } from "@/features/team/Actions/assignRole";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);
const mockUserFindUnique = vi.mocked(db.user.findUnique);
const mockSendOrgMail = vi.mocked(sendOrgMail);
const mockGetOrgFromAddress = vi.mocked(getOrgFromAddress);

const ORG_A = "org-a";
const ORG_B = "org-b";

// ---------- Auth setup helpers ----------

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "owner@orgA.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupOrgAAdmin() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "admin@orgA.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "admin",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

function setupOrgAMember() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "member@orgA.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "member",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

/**
 * User whose built-in role is "member" but whose custom role has isAdmin:true.
 * withAuth grants them access (roleIsAdmin=true), but actions that check the
 * built-in role string will incorrectly block them (BUG-6, BUG-7).
 */
function setupOrgACustomAdmin() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "cadmin@orgA.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "member",
    roleId: "custom-admin-role-id",
    customRole: { isAdmin: true, permissions: [] },
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

// ---------- Shared fixtures ----------

const VALID_INVITATION = {
  id: "inv-1",
  token: "tok-abc",
  email: "invited@example.com",
  organizationId: ORG_A,
  status: "pending",
  role: "member",
  roleId: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cookies).mockResolvedValue({ set: vi.fn(), get: vi.fn() } as any);
});

// ============================================================================
// acceptInvitation — role and org assignment correctness
// ============================================================================

describe("acceptInvitation — role and org assignment correctness", () => {
  beforeEach(() => {
    // acceptInvitation uses getCachedSession directly (not withAuth)
    mockSession.mockResolvedValue({
      user: { id: "invited-user", email: "invited@example.com" },
    } as any);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}] as any);
  });

  it("creates membership in the invitation's org, not any other org", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      organizationId: ORG_A,
    } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(vi.mocked(db.organizationMember.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("assigns the role specified in the invitation — 'admin'", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      role: "admin",
    } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(vi.mocked(db.organizationMember.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "admin" }),
      })
    );
  });

  it("assigns the role specified in the invitation — 'member'", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      role: "member",
    } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(vi.mocked(db.organizationMember.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "member" }),
      })
    );
  });

  it("assigns the custom roleId from the invitation when present", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      roleId: "custom-technician-role",
    } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(vi.mocked(db.organizationMember.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleId: "custom-technician-role" }),
      })
    );
  });

  it("assigns null roleId when the invitation has no custom role", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      roleId: null,
    } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(vi.mocked(db.organizationMember.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleId: null }),
      })
    );
  });

  it("sets the active-org cookie to the invitation's organizationId after accept", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      organizationId: ORG_A,
    } as any);
    const mockSet = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ set: mockSet, get: vi.fn() } as any);

    await acceptInvitation({ token: "tok-abc" });

    expect(mockSet).toHaveBeenCalledWith("active-org-id", ORG_A, expect.any(Object));
  });

  it("does not create a second membership when the user is already a member", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue(VALID_INVITATION as any);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ id: "existing-mem" } as any);
    vi.mocked(db.teamInvitation.update).mockResolvedValue({} as any);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(true);
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("email mismatch prevents joining another org's team via a stolen token", async () => {
    mockSession.mockResolvedValue({
      user: { id: "attacker", email: "attacker@evil.com" },
    } as any);
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue(VALID_INVITATION as any);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("This invitation was sent to a different email address");
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
  });

  it("cancelled invitation cannot be accepted", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      status: "cancelled",
    } as any);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("This invitation is no longer valid");
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
  });

  it("already-accepted invitation cannot be re-accepted", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      status: "accepted",
    } as any);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("This invitation is no longer valid");
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
  });

  it("expired invitation cannot be accepted", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      ...VALID_INVITATION,
      expiresAt: new Date(Date.now() - 1000),
    } as any);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("This invitation has expired");
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
  });

  it("unknown/garbage token returns 'Invitation not found'", async () => {
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue(null);

    const result = await acceptInvitation({ token: "garbage-token" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invitation not found");
    expect(vi.mocked(db.organizationMember.create)).not.toHaveBeenCalled();
  });

  it("unauthenticated call returns an error without touching the DB", async () => {
    mockSession.mockResolvedValue(null);

    const result = await acceptInvitation({ token: "tok-abc" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("You must be signed in to accept an invitation");
    expect(vi.mocked(db.teamInvitation.findUnique)).not.toHaveBeenCalled();
  });
});

// ============================================================================
// sendInvitation — org scoping, role storage, roleId validation
// ============================================================================

describe("sendInvitation — org scoping and role validation", () => {
  beforeEach(() => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      organizationId: ORG_A,
      role: "owner",
      organization: { name: "Org A Auto" },
    } as any);
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null);
    vi.mocked(db.teamInvitation.deleteMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(db.teamInvitation.create).mockResolvedValue({
      id: "inv-new",
      token: "new-tok",
      organizationId: ORG_A,
    } as any);
    mockSendOrgMail.mockResolvedValue(undefined as any);
    mockGetOrgFromAddress.mockResolvedValue("noreply@org.com" as any);
  });

  it("invitation is scoped to the caller's organizationId (from auth context)", async () => {
    await sendInvitation({ email: "new@example.com", role: "member" });

    expect(vi.mocked(db.teamInvitation.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("stores the requested role in the invitation", async () => {
    await sendInvitation({ email: "new@example.com", role: "admin" });

    expect(vi.mocked(db.teamInvitation.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "admin" }),
      })
    );
  });

  it("stores the invitedById as the caller's userId", async () => {
    await sendInvitation({ email: "new@example.com", role: "member" });

    expect(vi.mocked(db.teamInvitation.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitedById: "user-a" }),
      })
    );
  });

  it("rejects a duplicate invitation for the same email in the same org", async () => {
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue({ id: "existing-inv" } as any);

    const result = await sendInvitation({ email: "existing@example.com", role: "member" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("An invitation has already been sent to this email");
    expect(vi.mocked(db.teamInvitation.create)).not.toHaveBeenCalled();
  });

  it("cleans up stale non-pending invitations before creating a fresh one", async () => {
    await sendInvitation({ email: "returning@example.com", role: "member" });

    expect(vi.mocked(db.teamInvitation.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: "returning@example.com",
          organizationId: ORG_A,
          status: { not: "pending" },
        }),
      })
    );
  });

  it("rolls back the invitation record when the email send fails", async () => {
    mockSendOrgMail.mockRejectedValue(new Error("SMTP error") as any);
    vi.mocked(db.teamInvitation.delete).mockResolvedValue({} as any);

    const result = await sendInvitation({ email: "new@example.com", role: "member" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to send invitation email. Please try again.");
    expect(vi.mocked(db.teamInvitation.delete)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-new" } })
    );
  });

  it("duplicate check is scoped to the caller's org — same email in different org is allowed", async () => {
    // findFirst with { email, organizationId: ORG_A, status: "pending" } returns null
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null);

    const result = await sendInvitation({ email: "shared@example.com", role: "member" });

    expect(result.success).toBe(true);
    expect(vi.mocked(db.teamInvitation.create)).toHaveBeenCalled();
  });

  it("rejects a roleId from another org (org-scoped validation)", async () => {
    // role.findFirst with { id, organizationId: ORG_A } returns null for a foreign role
    vi.mocked(db.role.findFirst).mockResolvedValue(null);

    const result = await sendInvitation({
      email: "new@example.com",
      role: "member",
      roleId: "org-b-role-id",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Role not found");
    expect(vi.mocked(db.teamInvitation.create)).not.toHaveBeenCalled();
  });

  it("roleId lookup is scoped to the caller's organizationId", async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue(null);

    await sendInvitation({
      email: "new@example.com",
      role: "member",
      roleId: "some-role-id",
    });

    expect(vi.mocked(db.role.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ============================================================================
// cancelInvitation — org isolation and authorization
// ============================================================================

describe("cancelInvitation — org isolation and authorization", () => {
  it("owner can cancel their org's pending invitation", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "owner",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue({ ...VALID_INVITATION } as any);
    vi.mocked(db.teamInvitation.update).mockResolvedValue({} as any);

    const result = await cancelInvitation({ invitationId: "inv-1" });

    expect(result.success).toBe(true);
  });

  it("admin can cancel their org's pending invitation", async () => {
    setupOrgAAdmin();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "admin",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue({ ...VALID_INVITATION } as any);
    vi.mocked(db.teamInvitation.update).mockResolvedValue({} as any);

    const result = await cancelInvitation({ invitationId: "inv-1" });

    expect(result.success).toBe(true);
  });

  it("plain member (built-in role) cannot cancel an invitation", async () => {
    setupOrgAMember();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "member",
      organizationId: ORG_A,
    } as any);

    const result = await cancelInvitation({ invitationId: "inv-1" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Only owners and admins can cancel invitations");
    expect(vi.mocked(db.teamInvitation.update)).not.toHaveBeenCalled();
  });

  it("custom isAdmin member can cancel invitations (isAdmin covers custom roles)", async () => {
    setupOrgACustomAdmin();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "member",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue({ ...VALID_INVITATION } as any);
    vi.mocked(db.teamInvitation.update).mockResolvedValue({} as any);

    const result = await cancelInvitation({ invitationId: "inv-1" });

    expect(result.success).toBe(true);
  });

  it("cannot cancel an invitation that belongs to another org", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "owner",
      organizationId: ORG_A,
    } as any);
    // The invitation lookup is scoped to organizationId: ORG_A → returns null for Org B's invite
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null);

    const result = await cancelInvitation({ invitationId: "org-b-inv-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invitation not found");
    expect(vi.mocked(db.teamInvitation.update)).not.toHaveBeenCalled();
  });

  it("cannot cancel an already-cancelled invitation", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "owner",
      organizationId: ORG_A,
    } as any);
    // status:"pending" filter excludes cancelled invitations
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null);

    const result = await cancelInvitation({ invitationId: "inv-1" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invitation not found");
  });

  it("invitation lookup is scoped to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-1",
      role: "owner",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null);

    await cancelInvitation({ invitationId: "inv-x" });

    expect(vi.mocked(db.teamInvitation.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });
});

// ============================================================================
// getPendingInvitations — org scoping
// ============================================================================

describe("getPendingInvitations — org scoping", () => {
  it("query is scoped to the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.teamInvitation.findMany).mockResolvedValue([]);

    await getPendingInvitations();

    expect(vi.mocked(db.teamInvitation.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("filters out expired invitations via expiresAt > now", async () => {
    setupOrgAOwner();
    vi.mocked(db.teamInvitation.findMany).mockResolvedValue([]);

    await getPendingInvitations();

    expect(vi.mocked(db.teamInvitation.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      })
    );
  });

  it("returns the caller's org's invitations", async () => {
    setupOrgAOwner();
    const orgAInvites = [
      { id: "inv-1", email: "a@example.com", role: "member", organizationId: ORG_A },
    ];
    vi.mocked(db.teamInvitation.findMany).mockResolvedValue(orgAInvites as any);

    const result = await getPendingInvitations();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect((result.data as any)[0].id).toBe("inv-1");
  });

  it("owner from Org B gets an empty list even if Org A has pending invitations", async () => {
    // Setup: Org B owner's auth context
    mockSession.mockResolvedValue({ user: { id: "user-b", email: "owner@orgB.com" } } as any);
    mockMembership.mockResolvedValue({
      organizationId: ORG_B,
      role: "owner",
      roleId: null,
      customRole: null,
    } as any);
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
    // DB returns empty because the where clause uses organizationId: ORG_B
    vi.mocked(db.teamInvitation.findMany).mockResolvedValue([]);

    const result = await getPendingInvitations();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
    // Verify the query used ORG_B, not ORG_A
    expect(vi.mocked(db.teamInvitation.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_B }),
      })
    );
  });
});

// ============================================================================
// assignRole — org isolation and role validation
// ============================================================================

describe("assignRole — org isolation and role validation", () => {
  it("owner can assign a built-in role to a member", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-2",
      organizationId: ORG_A,
      role: "member",
    } as any);
    vi.mocked(db.organizationMember.update).mockResolvedValue({} as any);

    const result = await assignRole({ memberId: "mem-2", role: "admin", roleId: null });

    expect(result.success).toBe(true);
  });

  it("member not in the caller's org returns 'Member not found'", async () => {
    setupOrgAOwner();
    // findFirst scoped to organizationId: ORG_A returns null for a foreign member
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);

    const result = await assignRole({ memberId: "org-b-member-id", roleId: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Member not found");
    expect(vi.mocked(db.organizationMember.update)).not.toHaveBeenCalled();
  });

  it("member lookup always includes the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);

    await assignRole({ memberId: "mem-x", roleId: null });

    expect(vi.mocked(db.organizationMember.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("cannot assign a role to the org owner", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-owner",
      organizationId: ORG_A,
      role: "owner",
    } as any);

    const result = await assignRole({ memberId: "mem-owner", role: "admin", roleId: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cannot assign a role to the owner");
    expect(vi.mocked(db.organizationMember.update)).not.toHaveBeenCalled();
  });

  it("rejects a roleId that does not belong to the caller's org", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-2",
      organizationId: ORG_A,
      role: "member",
    } as any);
    // role.findFirst({ where: { id, organizationId: ORG_A } }) returns null for a foreign role
    vi.mocked(db.role.findFirst).mockResolvedValue(null);

    const result = await assignRole({ memberId: "mem-2", roleId: "org-b-role-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Role not found");
    expect(vi.mocked(db.organizationMember.update)).not.toHaveBeenCalled();
  });

  it("role lookup always includes the caller's organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-2",
      organizationId: ORG_A,
      role: "member",
    } as any);
    vi.mocked(db.role.findFirst).mockResolvedValue(null);

    await assignRole({ memberId: "mem-2", roleId: "some-role-id" });

    expect(vi.mocked(db.role.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("plain member (built-in role) cannot assign roles", async () => {
    setupOrgAMember();

    const result = await assignRole({ memberId: "mem-2", role: "admin", roleId: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Only owners and admins can assign roles");
    expect(vi.mocked(db.organizationMember.update)).not.toHaveBeenCalled();
  });

  it("custom isAdmin member can assign roles (isAdmin covers custom roles)", async () => {
    setupOrgACustomAdmin();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-2",
      organizationId: ORG_A,
      role: "member",
    } as any);
    vi.mocked(db.organizationMember.update).mockResolvedValue({} as any);

    const result = await assignRole({ memberId: "mem-2", role: "member", roleId: null });

    expect(result.success).toBe(true);
  });

  it("admin can assign a custom role to a member", async () => {
    setupOrgAAdmin();
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: "mem-2",
      organizationId: ORG_A,
      role: "member",
    } as any);
    vi.mocked(db.role.findFirst).mockResolvedValue({
      id: "tech-role-id",
      name: "Technician",
      organizationId: ORG_A,
    } as any);
    vi.mocked(db.organizationMember.update).mockResolvedValue({} as any);

    const result = await assignRole({ memberId: "mem-2", roleId: "tech-role-id" });

    expect(result.success).toBe(true);
    expect(vi.mocked(db.organizationMember.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleId: "tech-role-id" }),
      })
    );
  });
});
