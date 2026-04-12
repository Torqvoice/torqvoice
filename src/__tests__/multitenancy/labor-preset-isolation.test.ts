/**
 * Multi-tenancy isolation tests: Labor Presets
 *
 * Verifies that a user from Org A cannot read, update, or delete labor presets
 * belonging to Org B.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    laborPreset: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    laborPresetItem: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import {
  getLaborPreset,
  updateLaborPreset,
  deleteLaborPreset,
} from "@/features/labor-presets/Actions/laborPresetActions";

const mockSession = vi.mocked(getCachedSession);
const mockMembership = vi.mocked(getCachedMembership);
const mockUserFindUnique = vi.mocked(db.user.findUnique);

const ORG_A = "org-a";
const ORG_B = "org-b";

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: "user-a", email: "a@example.com" } } as any);
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getLaborPreset — cross-org isolation", () => {
  it("returns error when requesting another org's preset", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue(null);

    const result = await getLaborPreset(`${ORG_B}-preset-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Preset not found");
  });

  it("read query is scoped to organizationId", async () => {
    setupOrgAOwner();
    const preset = { id: "preset-a", organizationId: ORG_A, name: "Standard Labor", items: [] };
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue(preset as any);

    await getLaborPreset("preset-a");

    expect(vi.mocked(db.laborPreset.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("returns preset data for the caller's own preset", async () => {
    setupOrgAOwner();
    const preset = { id: "preset-a", organizationId: ORG_A, name: "Standard Labor", items: [] };
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue(preset as any);

    const result = await getLaborPreset("preset-a");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("preset-a");
  });
});

describe("updateLaborPreset — cross-org isolation", () => {
  it("returns error when targeting another org's preset", async () => {
    setupOrgAOwner();
    // findFirst with organizationId filter returns null for cross-org preset
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue(null);

    const result = await updateLaborPreset({
      id: `${ORG_B}-preset-id`,
      name: "Hacked",
      items: [{ description: "test", hours: 1, rate: 50 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Preset not found");
  });

  it("update includes organizationId check via findFirst ownership lookup", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue({ id: "preset-a" } as any);
    const mockTx = {
      laborPresetItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      laborPreset: { update: vi.fn().mockResolvedValue({ id: "preset-a", items: [] }) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(mockTx));

    await updateLaborPreset({
      id: "preset-a",
      name: "Updated Labor",
      items: [{ description: "Oil change", hours: 1, rate: 75 }],
    });

    expect(vi.mocked(db.laborPreset.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully updates the caller's own preset", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.findFirst).mockResolvedValue({ id: "preset-a" } as any);
    const mockTx = {
      laborPresetItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      laborPreset: {
        update: vi.fn().mockResolvedValue({
          id: "preset-a",
          name: "Updated Labor",
          items: [{ description: "Oil change", hours: 1, rate: 75 }],
        }),
      },
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(mockTx));

    const result = await updateLaborPreset({
      id: "preset-a",
      name: "Updated Labor",
      items: [{ description: "Oil change", hours: 1, rate: 75 }],
    });

    expect(result.success).toBe(true);
    expect((result.data as any).updated).toBe(true);
  });
});

describe("deleteLaborPreset — cross-org isolation", () => {
  it("returns error when deleting another org's preset", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.deleteMany).mockResolvedValue({ count: 0 } as any);

    const result = await deleteLaborPreset(`${ORG_B}-preset-id`);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Preset not found");
  });

  it("delete query includes organizationId", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.deleteMany).mockResolvedValue({ count: 1 } as any);

    await deleteLaborPreset("preset-a");

    expect(vi.mocked(db.laborPreset.deleteMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("successfully deletes the caller's own preset", async () => {
    setupOrgAOwner();
    vi.mocked(db.laborPreset.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await deleteLaborPreset("preset-a");

    expect(result.success).toBe(true);
    expect((result.data as any).deleted).toBe(true);
  });
});
