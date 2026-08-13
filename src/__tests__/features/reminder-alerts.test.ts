/**
 * Due-reminder notifications: per-reminder channel choice (bell / email),
 * notify-once semantics, and re-arming when a reminder is rescheduled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn().mockResolvedValue("Shop <shop@example.com>"),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    reminder: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    organizationMember: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendOrgMail } from "@/lib/email";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { processDueReminders } from "@/lib/cron/reminder-alerts";
import { createReminder, updateReminder } from "@/features/vehicles/Actions/reminderActions";

const ORG_A = "org-a";

const dueReminder = (overrides: Record<string, unknown> = {}) => ({
  id: "rem-1",
  title: "EU-kontroll",
  description: null,
  dueDate: new Date("2026-08-13T07:00:00Z"),
  notifyInApp: true,
  notifyEmail: false,
  organizationId: ORG_A,
  customer: null,
  vehicle: {
    id: "veh-1",
    make: "Volvo",
    model: "V70",
    year: 2019,
    licensePlate: "AB12345",
    customer: { name: "Kari" },
  },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.reminder.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("processDueReminders", () => {
  it("only picks up uncompleted, unnotified reminders with a channel enabled", async () => {
    vi.mocked(db.reminder.findMany).mockResolvedValue([]);
    await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(vi.mocked(db.reminder.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isCompleted: false,
          notifiedAt: null,
          OR: [{ notifyInApp: true }, { notifyEmail: true }],
        }),
      })
    );
  });

  it("sends a bell notification and marks the reminder notified", async () => {
    vi.mocked(db.reminder.findMany).mockResolvedValue([dueReminder()] as never);

    const count = await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(count).toBe(1);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        type: "reminder.due",
        entityId: "rem-1",
        entityUrl: "/vehicles/veh-1?tab=reminders",
      })
    );
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
    expect(vi.mocked(db.reminder.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["rem-1"] } },
        data: { notifiedAt: expect.any(Date) },
      })
    );
  });

  it("emails owners/admins when the reminder chose email, without a bell", async () => {
    vi.mocked(db.reminder.findMany).mockResolvedValue([
      dueReminder({ notifyInApp: false, notifyEmail: true }),
    ] as never);
    vi.mocked(db.organizationMember.findMany).mockResolvedValue([
      { user: { email: "owner@shop.no", name: "Owner" } },
    ] as never);

    await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    expect(vi.mocked(sendOrgMail)).toHaveBeenCalledWith(
      ORG_A,
      expect.objectContaining({ to: "owner@shop.no", subject: expect.stringContaining("EU-kontroll") })
    );
  });

  it("still marks reminders notified when email sending fails", async () => {
    vi.mocked(db.reminder.findMany).mockResolvedValue([
      dueReminder({ notifyEmail: true }),
    ] as never);
    vi.mocked(db.organizationMember.findMany).mockResolvedValue([
      { user: { email: "owner@shop.no", name: "Owner" } },
    ] as never);
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("smtp down"));

    await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(vi.mocked(db.reminder.updateMany)).toHaveBeenCalled();
  });
});

describe("updateReminder — re-arm on reschedule", () => {
  function setupOrgAOwner() {
    vi.mocked(getCachedSession).mockResolvedValue({ user: { id: "user-a", email: "a@x.no" } } as never);
    vi.mocked(getCachedMembership).mockResolvedValue({
      organizationId: ORG_A, role: "owner", roleId: null, customRole: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never);
  }

  it("clears notifiedAt when the due date changes", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: "veh-1", customerId: null } as never);
    vi.mocked(db.reminder.findFirst).mockResolvedValue({
      id: "rem-1", vehicleId: "veh-1", dueDate: new Date("2026-08-01T00:00:00Z"),
    } as never);
    vi.mocked(db.reminder.update).mockResolvedValue({ id: "rem-1" } as never);

    await updateReminder({ id: "rem-1", vehicleId: "veh-1", title: "x", dueDate: "2026-09-01" });

    expect(vi.mocked(db.reminder.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notifiedAt: null }),
      })
    );
  });

  it("keeps notifiedAt when the due date is unchanged", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: "veh-1", customerId: null } as never);
    const same = new Date("2026-09-01T00:00:00.000Z");
    vi.mocked(db.reminder.findFirst).mockResolvedValue({
      id: "rem-1", vehicleId: "veh-1", dueDate: same,
    } as never);
    vi.mocked(db.reminder.update).mockResolvedValue({ id: "rem-1" } as never);

    await updateReminder({ id: "rem-1", vehicleId: "veh-1", title: "x", dueDate: "2026-09-01" });

    const call = vi.mocked(db.reminder.update).mock.calls[0][0] as { data: { notifiedAt?: unknown } };
    expect(call.data.notifiedAt).toBeUndefined();
  });
});

describe("reminder targets — vehicle, customer, or workshop", () => {
  function setupOrgAOwner() {
    vi.mocked(getCachedSession).mockResolvedValue({ user: { id: "user-a", email: "a@x.no" } } as never);
    vi.mocked(getCachedMembership).mockResolvedValue({
      organizationId: ORG_A, role: "owner", roleId: null, customRole: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never);
  }

  it("workshop reminder: no vehicle, no customer, org-stamped", async () => {
    setupOrgAOwner();
    vi.mocked(db.reminder.create).mockResolvedValue({ id: "rem-w", title: "Petter has birthday", vehicleId: null } as never);

    const result = await createReminder({ title: "Petter has birthday", dueDate: "2026-09-01" });

    expect(result.success).toBe(true);
    expect(vi.mocked(db.reminder.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_A,
          vehicleId: null,
          customerId: null,
        }),
      })
    );
  });

  it("customer reminder: verifies the customer belongs to the org", async () => {
    setupOrgAOwner();
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await createReminder({ title: "Follow up", customerId: "cust-other-org" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });

  it("vehicle reminder: takes the vehicle's customer automatically", async () => {
    setupOrgAOwner();
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: "veh-1", customerId: "cust-a" } as never);
    vi.mocked(db.reminder.create).mockResolvedValue({ id: "rem-v", title: "EU", vehicleId: "veh-1" } as never);

    const result = await createReminder({ title: "EU", vehicleId: "veh-1" });

    expect(result.success).toBe(true);
    expect(vi.mocked(db.reminder.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_A,
          vehicleId: "veh-1",
          customerId: "cust-a",
        }),
      })
    );
  });

  it("cron notifies a workshop reminder with a plain title and /reminders link", async () => {
    vi.mocked(db.reminder.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.reminder.findMany).mockResolvedValue([
      dueReminder({ vehicle: null, customer: null, title: "Petter has birthday" }),
    ] as never);

    await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Petter has birthday",
        entityUrl: "/reminders",
      })
    );
  });

  it("cron links a customer reminder to the customer page", async () => {
    vi.mocked(db.reminder.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.reminder.findMany).mockResolvedValue([
      dueReminder({ vehicle: null, customer: { id: "cust-a", name: "Petter" } }),
    ] as never);

    await processDueReminders(new Date("2026-08-13T12:00:00Z"));

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "EU-kontroll — Petter",
        entityUrl: "/customers/cust-a",
      })
    );
  });
});
