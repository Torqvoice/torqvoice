/**
 * Tests that a broken email configuration cannot damage anything else.
 *
 * Two distinct failures are guarded here, and the second is the dangerous one:
 *
 *  1. A mail error must not fail the user's operation. Saving a work order that
 *     happens to take stock below a reorder point must succeed even if SMTP is
 *     misconfigured — the alert is a side effect, not part of the save.
 *
 *  2. A mail error must not prevent parts being marked as alerted. Marking is
 *     what makes the system quiet: if an exception escaped before it, the same
 *     parts would be re-reported on every subsequent run, so a bad SMTP setting
 *     would silently turn into in-app notification spam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    appSetting: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    inventoryPart: { updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    organizationMember: { findMany: vi.fn(), findFirst: vi.fn() },
    notification: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));

import { db } from "@/lib/db";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { notify } from "@/lib/notify";
import { processOrgLowStock } from "@/lib/cron/low-stock-alerts";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

const ORG = "org-1";

/** Alerts on, email channel on, no throttle in the way. */
function enableAlerts() {
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED, value: "true" },
    { key: SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP, value: "true" },
    { key: SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL, value: "true" },
  ] as never);
}

/** One part that has just gone low and has never been alerted. */
function oneNewlyLowPart() {
  vi.mocked(db.$queryRaw).mockResolvedValue([
    {
      id: "p1",
      name: "Brake pad",
      partNumber: "BP-1",
      quantity: 1,
      minQuantity: 5,
      lowStockAlertedAt: null,
    },
  ] as never);
}

function markedIds() {
  return vi
    .mocked(db.inventoryPart.updateMany)
    .mock.calls.filter((c) => (c[0] as never as { data: { lowStockAlertedAt?: Date } }).data.lowStockAlertedAt)
    .flatMap((c) => (c[0] as never as { where: { id: { in: string[] } } }).where.id.in);
}

describe("low-stock alerts — email failure isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableAlerts();
    oneNewlyLowPart();
    vi.mocked(db.inventoryPart.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Shop" } as never);
    vi.mocked(db.organizationMember.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" } },
    ] as never);
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(db.appSetting.upsert).mockResolvedValue({} as never);
    vi.mocked(getOrgFromAddress).mockResolvedValue("shop@example.com");
    vi.mocked(sendOrgMail).mockResolvedValue(undefined as never);
  });

  it("still resolves when the mail server throws", async () => {
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("ECONNREFUSED"));
    // Must not reject — the caller is a work-order save.
    await expect(processOrgLowStock(ORG)).resolves.toBeDefined();
  });

  it("still marks parts as alerted when the mail server throws", async () => {
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("ECONNREFUSED"));
    await processOrgLowStock(ORG);
    // Without this, the same part re-alerts on every run: spam via a bad SMTP.
    expect(markedIds()).toContain("p1");
  });

  it("still marks parts when the sender address cannot be resolved", async () => {
    vi.mocked(getOrgFromAddress).mockRejectedValue(new Error("bad email config"));
    const result = await processOrgLowStock(ORG);
    expect(markedIds()).toContain("p1");
    expect(result).toMatchObject({ emailed: false });
  });

  it("skips the digest rather than inventing a sender", async () => {
    vi.mocked(getOrgFromAddress).mockRejectedValue(new Error("bad email config"));
    await processOrgLowStock(ORG);
    expect(sendOrgMail).not.toHaveBeenCalled();
  });

  it("still delivers the in-app notification when email is broken", async () => {
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("ECONNREFUSED"));
    await processOrgLowStock(ORG);
    // The channels are independent; a mail outage must not silence the bell.
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("reports emailed:false when delivery failed", async () => {
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await processOrgLowStock(ORG);
    expect(result).toMatchObject({ alerted: 1, emailed: false });
  });

  it("does not fail when recording the last-send time throws", async () => {
    vi.mocked(db.appSetting.upsert).mockRejectedValue(new Error("db write failed"));
    await expect(processOrgLowStock(ORG)).resolves.toBeDefined();
    expect(markedIds()).toContain("p1");
  });

  it("still marks parts when the recipient lookup itself throws", async () => {
    // This is the path that actually escapes sendDigest: sendOrgMail failures
    // are caught per-recipient inside it, but a failure resolving *who* to mail
    // propagates. Without the isolating try/catch around the digest call, this
    // aborts before marking and the part re-alerts on every run.
    vi.mocked(db.organizationMember.findMany).mockRejectedValue(
      new Error("db unavailable"),
    );
    await expect(processOrgLowStock(ORG)).resolves.toBeDefined();
    expect(markedIds()).toContain("p1");
  });

  it("reports emailed:true on the happy path", async () => {
    const result = await processOrgLowStock(ORG);
    expect(sendOrgMail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ alerted: 1, emailed: true });
  });
});
