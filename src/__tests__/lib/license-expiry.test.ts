import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    appSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn().mockResolvedValue(undefined),
  getOrgFromAddress: vi.fn().mockResolvedValue("noreply@test.com"),
}));

vi.mock("@/lib/notify", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notification-bus", () => ({
  notificationBus: { emit: vi.fn() },
}));

import { db } from "@/lib/db";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { notify } from "@/lib/notify";
import {
  revalidateOrganizationLicense,
  sendExpiryWarning,
} from "@/lib/cron/check-licenses";

const ORG_ID = "org-test-1";
const USER_ID = "user-test-1";
const LICENSE_KEY = "test-license-key";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    userId: USER_ID,
  } as any);
  vi.mocked(db.$transaction).mockResolvedValue(undefined);
  vi.mocked(db.appSetting.upsert).mockResolvedValue({} as any);
});

describe("sendExpiryWarning", () => {
  it("sends notification and email when no warning sent today", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await sendExpiryWarning(ORG_ID, 7);

    // Records today's warning
    expect(db.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_key: {
            organizationId: ORG_ID,
            key: "license.lastExpiryWarning",
          },
        },
      })
    );

    // Sends in-app notification
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "license_expiring",
        title: "License expires in 7 days",
        organizationId: ORG_ID,
        entityUrl: "/settings/license",
      })
    );

    // Sends email
    expect(getOrgFromAddress).toHaveBeenCalledWith(ORG_ID);
    expect(sendOrgMail).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        to: "owner@test.com",
        subject: "Your license expires in 7 days",
      })
    );
  });

  it("uses singular 'day' when 1 day left", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await sendExpiryWarning(ORG_ID, 1);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "License expires in 1 day",
      })
    );
    expect(sendOrgMail).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        subject: "Your license expires in 1 day",
      })
    );
  });

  it("skips if already warned today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({
      value: today,
    } as any);

    await sendExpiryWarning(ORG_ID, 7);

    expect(notify).not.toHaveBeenCalled();
    expect(sendOrgMail).not.toHaveBeenCalled();
  });

  it("sends again on a new day", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({
      value: "2020-01-01",
    } as any);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await sendExpiryWarning(ORG_ID, 5);

    expect(notify).toHaveBeenCalled();
    expect(sendOrgMail).toHaveBeenCalled();
  });

  it("skips email if no org member found", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);

    await sendExpiryWarning(ORG_ID, 7);

    expect(notify).not.toHaveBeenCalled();
    expect(sendOrgMail).not.toHaveBeenCalled();
  });

  it("skips email if owner has no email", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    // First call: findFirst for orgMember (to record warning)
    // Second call: findFirst for owner (to send email)
    vi.mocked(db.organizationMember.findFirst)
      .mockResolvedValueOnce({ userId: USER_ID } as any)
      .mockResolvedValueOnce({ user: { email: null } } as any);

    await sendExpiryWarning(ORG_ID, 7);

    // Notification is still sent
    expect(notify).toHaveBeenCalled();
    // Email is skipped
    expect(sendOrgMail).not.toHaveBeenCalled();
  });

  it("does not throw if email sending fails", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("SMTP down"));

    // Should not throw
    await expect(sendExpiryWarning(ORG_ID, 3)).resolves.not.toThrow();
    expect(notify).toHaveBeenCalled();
  });
});

describe("revalidateOrganizationLicense", () => {
  function mockFetch(response: {
    ok: boolean;
    data?: Record<string, unknown>;
  }) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: response.ok,
      json: () => Promise.resolve(response.data || {}),
    });
  }

  it("stores license data and sends expiry warning when within 14 days", async () => {
    const expiresAt = daysFromNow(10);
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt },
    });
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    // Should store license settings
    expect(db.$transaction).toHaveBeenCalled();

    // Should trigger expiry warning
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "license_expiring",
        organizationId: ORG_ID,
      })
    );
  });

  it("does not send warning when expiry is more than 14 days away", async () => {
    const expiresAt = daysFromNow(30);
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt },
    });

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(db.$transaction).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not send warning when license is invalid", async () => {
    const expiresAt = daysFromNow(5);
    mockFetch({
      ok: true,
      data: { valid: false, expiresAt },
    });

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(notify).not.toHaveBeenCalled();
  });

  it("does not send warning when license is already expired", async () => {
    const expiresAt = daysFromNow(-1);
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt },
    });

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(notify).not.toHaveBeenCalled();
  });

  it("does not send warning when no expiresAt", async () => {
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro" },
    });

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(notify).not.toHaveBeenCalled();
  });

  it("handles API failure gracefully", async () => {
    mockFetch({ ok: false });

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    // Should still store the result (valid=false)
    expect(db.$transaction).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips if no org member found", async () => {
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt: daysFromNow(5) },
    });
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("sends warning at exactly 14 days", async () => {
    const expiresAt = daysFromNow(14);
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt },
    });
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(notify).toHaveBeenCalled();
  });

  it("sends warning at exactly 1 day", async () => {
    const expiresAt = daysFromNow(1);
    mockFetch({
      ok: true,
      data: { valid: true, plan: "pro", expiresAt },
    });
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: "owner@test.com" },
    } as any);

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "License expires in 1 day",
      })
    );
  });
});
