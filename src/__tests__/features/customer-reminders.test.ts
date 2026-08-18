/**
 * Customer reminders: selection of eligible vehicles, dedupe against the
 * CustomerReminderLog ledger, channel gating, and skipping of archived /
 * dismissed / contactless vehicles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn().mockResolvedValue("Shop <shop@example.com>"),
}));
vi.mock("@/lib/sms", () => ({
  sendOrgSms: vi.fn(),
  getOrgSmsPhoneNumber: vi.fn(),
  getOrgSmsProvider: vi.fn(),
  normalizeOrgPhone: vi.fn(),
}));
vi.mock("@/lib/features", () => ({
  getFeatures: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    appSetting: { findMany: vi.fn() },
    inspection: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    customerReminderLog: { findMany: vi.fn(), create: vi.fn() },
    smsMessage: { create: vi.fn(), update: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendOrgMail } from "@/lib/email";
import {
  sendOrgSms,
  getOrgSmsPhoneNumber,
  getOrgSmsProvider,
  normalizeOrgPhone,
} from "@/lib/sms";
import { getFeatures } from "@/lib/features";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { processOrgCustomerReminders } from "@/lib/cron/customer-reminders";
import {
  buildInspectionDueKey,
  buildServiceDueKey,
  selectInspectionsDue,
} from "@/features/customer-reminders/Lib/selectReminderCandidates";
import { evaluateServiceDue } from "@/features/vehicles/Lib/predictedMaintenance";

const ORG = "org-1";
const NOW = new Date("2026-08-18T12:00:00Z");

const setting = (key: string, value: string) => ({ key, value });

const customer = (overrides: Record<string, unknown> = {}) => ({
  id: "cust-1",
  name: "Kari Nordmann",
  email: "kari@example.com",
  phone: "+4790000000",
  ...overrides,
});

const inspectionRow = (overrides: Record<string, unknown> = {}) => ({
  vehicleId: "veh-1",
  nextTestDue: new Date("2026-09-01T00:00:00Z"),
  createdAt: new Date("2026-06-01T00:00:00Z"),
  vehicle: {
    id: "veh-1",
    make: "Volvo",
    model: "V70",
    year: 2019,
    licensePlate: "AB12345",
    customer: customer(),
  },
  ...overrides,
});

/** Two completed services a year apart at 100 km/day: heavily overdue by NOW. */
const overdueServiceRecords = [
  {
    serviceDate: new Date("2025-01-01T00:00:00Z"),
    startDateTime: null,
    mileage: 0,
  },
  {
    serviceDate: new Date("2026-01-01T00:00:00Z"),
    startDateTime: null,
    mileage: 36500,
  },
];

const serviceVehicle = (overrides: Record<string, unknown> = {}) => ({
  id: "veh-2",
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  licensePlate: "CD67890",
  customer: customer({ id: "cust-2" }),
  serviceRecords: overdueServiceRecords,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.inspection.findMany).mockResolvedValue([] as never);
  vi.mocked(db.vehicle.findMany).mockResolvedValue([] as never);
  vi.mocked(db.customerReminderLog.findMany).mockResolvedValue([] as never);
  vi.mocked(db.customerReminderLog.create).mockResolvedValue({} as never);
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Torq Garage" } as never);
  vi.mocked(db.smsMessage.create).mockResolvedValue({ id: "sms-1" } as never);
  vi.mocked(db.smsMessage.update).mockResolvedValue({} as never);
});

describe("processOrgCustomerReminders", () => {
  it("does nothing when neither reminder type is enabled", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: true });
    expect(vi.mocked(db.inspection.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(db.vehicle.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
  });

  it("emails the customer of a vehicle whose inspection is inside the lead window and writes the ledger", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
    ] as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 1, failed: 0 });
    expect(vi.mocked(sendOrgMail)).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ to: "kari@example.com" }),
    );
    expect(vi.mocked(db.customerReminderLog.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG,
        vehicleId: "veh-1",
        customerId: "cust-1",
        type: "inspection_due",
        dueKey: "2026-09-01",
        channel: "email",
        status: "sent",
      }),
    });
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, type: "customerReminders.sent" }),
    );
    // Archived vehicles and vehicles without a customer never leave the db
    expect(vi.mocked(db.inspection.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicle: { isArchived: false, customerId: { not: null } },
        }),
      }),
    );
  });

  it("does not resend an occurrence already present in the ledger", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
    ] as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);
    vi.mocked(db.customerReminderLog.findMany).mockResolvedValue([
      { vehicleId: "veh-1", type: "inspection_due", dueKey: "2026-09-01" },
    ] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 0, failed: 0 });
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
    expect(vi.mocked(db.customerReminderLog.create)).not.toHaveBeenCalled();
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it("re-reminds when the due date moved to a new occurrence", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
    ] as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);
    // Ledger has last year's occurrence, not this one
    vi.mocked(db.customerReminderLog.findMany).mockResolvedValue([
      { vehicleId: "veh-1", type: "inspection_due", dueKey: "2025-09-01" },
    ] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 1, failed: 0 });
  });

  it("skips inspections outside the lead window", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS, "7"),
    ] as never);
    // Due in 14 days, lead time only 7
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 0, failed: 0 });
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
  });

  it("skips customers with no reachable channel without writing the ledger", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
    ] as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([
      inspectionRow({
        vehicle: {
          ...inspectionRow().vehicle,
          customer: customer({ email: null }),
        },
      }),
    ] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 0, failed: 0 });
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
    expect(vi.mocked(db.customerReminderLog.create)).not.toHaveBeenCalled();
  });

  it("sends service-due reminders keyed by month and excludes archived/dismissed vehicles in the query", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED, "true"),
    ] as never);
    vi.mocked(db.vehicle.findMany).mockResolvedValue([serviceVehicle()] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 1, failed: 0 });
    expect(vi.mocked(db.vehicle.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isArchived: false,
          maintenanceDismissed: false,
          customerId: { not: null },
        }),
      }),
    );
    expect(vi.mocked(db.customerReminderLog.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "service_due",
        dueKey: "2026-08",
        vehicleId: "veh-2",
      }),
    });
  });

  it("sends no SMS when the plan lacks the sms feature, even with the toggle on", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL, "false"),
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS, "true"),
    ] as never);
    vi.mocked(getFeatures).mockResolvedValue({ sms: false } as never);
    vi.mocked(getOrgSmsProvider).mockResolvedValue("twilio" as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: true });
    expect(vi.mocked(sendOrgSms)).not.toHaveBeenCalled();
  });

  it("sends SMS when the plan and provider allow it, logging to the customer thread", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL, "false"),
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS, "true"),
    ] as never);
    vi.mocked(getFeatures).mockResolvedValue({ sms: true } as never);
    vi.mocked(getOrgSmsProvider).mockResolvedValue("twilio" as never);
    vi.mocked(normalizeOrgPhone).mockResolvedValue("+4790000000");
    vi.mocked(getOrgSmsPhoneNumber).mockResolvedValue("+4791111111");
    vi.mocked(sendOrgSms).mockResolvedValue({ providerMsgId: "SM1", to: "+4790000000" });
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 1, failed: 0 });
    expect(vi.mocked(sendOrgSms)).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ to: "+4790000000" }),
    );
    expect(vi.mocked(db.smsMessage.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: "outbound",
        customerId: "cust-1",
        relatedEntityType: "CustomerReminder",
      }),
    });
    expect(vi.mocked(db.customerReminderLog.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "sms", status: "sent" }),
    });
    expect(vi.mocked(sendOrgMail)).not.toHaveBeenCalled();
  });

  it("logs a failed row (still deduping) when every channel fails", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      setting(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED, "true"),
    ] as never);
    vi.mocked(db.inspection.findMany).mockResolvedValue([inspectionRow()] as never);
    vi.mocked(sendOrgMail).mockRejectedValue(new Error("smtp down"));

    const result = await processOrgCustomerReminders(ORG, NOW);

    expect(result).toEqual({ skipped: false, sent: 0, failed: 1 });
    expect(vi.mocked(db.customerReminderLog.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "failed", channel: "" }),
    });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });
});

describe("selectInspectionsDue", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("only considers the latest inspection per vehicle", () => {
    const rows = [
      // Newest first, as queried: fresh certificate pushed the date out a year
      {
        vehicleId: "veh-1",
        nextTestDue: new Date("2027-08-30T00:00:00Z"),
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        vehicleId: "veh-1",
        nextTestDue: new Date("2026-08-30T00:00:00Z"),
        createdAt: new Date("2024-08-01T00:00:00Z"),
      },
    ];
    expect(selectInspectionsDue(rows, now, 30)).toHaveLength(0);
  });

  it("keeps due dates inside the window and drops past or far-future ones", () => {
    const mk = (id: string, due: string) => ({
      vehicleId: id,
      nextTestDue: new Date(due),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const picked = selectInspectionsDue(
      [
        mk("in-window", "2026-09-01T00:00:00Z"),
        mk("today", "2026-08-18T06:00:00Z"),
        mk("past", "2026-08-10T00:00:00Z"),
        mk("far", "2026-12-01T00:00:00Z"),
      ],
      now,
      30,
    );
    expect(picked.map((p) => p.vehicleId).sort()).toEqual(["in-window", "today"]);
  });
});

describe("due keys", () => {
  it("keys inspections by day and service predictions by month", () => {
    expect(buildInspectionDueKey(new Date("2026-09-01T10:30:00Z"))).toBe("2026-09-01");
    expect(buildServiceDueKey(new Date("2026-08-18T12:00:00Z"))).toBe("2026-08");
  });
});

describe("evaluateServiceDue", () => {
  it("flags a vehicle as overdue once predicted mileage passes the interval", () => {
    const result = evaluateServiceDue(
      overdueServiceRecords,
      { serviceInterval: 15000, approachingThreshold: 1000 },
      NOW,
    );
    expect(result?.status).toBe("overdue");
    expect(result!.mileageSinceLastService).toBeGreaterThanOrEqual(15000);
  });

  it("returns null when there is not enough history", () => {
    expect(
      evaluateServiceDue(
        [overdueServiceRecords[0]],
        { serviceInterval: 15000, approachingThreshold: 1000 },
        NOW,
      ),
    ).toBeNull();
  });

  it("returns null when the vehicle is comfortably inside the interval", () => {
    const records = [
      { serviceDate: new Date("2026-06-01T00:00:00Z"), startDateTime: null, mileage: 10000 },
      { serviceDate: new Date("2026-08-01T00:00:00Z"), startDateTime: null, mileage: 10600 },
    ];
    expect(
      evaluateServiceDue(records, { serviceInterval: 15000, approachingThreshold: 1000 }, NOW),
    ).toBeNull();
  });
});
