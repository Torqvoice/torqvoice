import { CronJob } from "cron";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { sendOrgSms, getOrgSmsPhoneNumber, getOrgSmsProvider, normalizeOrgPhone } from "@/lib/sms";
import { getFeatures } from "@/lib/features";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import {
  DEFAULT_APPROACHING_THRESHOLD,
  DEFAULT_SERVICE_INTERVAL,
  evaluateServiceDue,
} from "@/features/vehicles/Lib/predictedMaintenance";
import {
  buildReminderMessage,
  type CustomerReminderType,
} from "@/features/customer-reminders/Lib/reminderMessages";
import {
  DEFAULT_INSPECTION_LEAD_DAYS,
  buildInspectionDueKey,
  buildServiceDueKey,
  reminderLogKey,
  selectInspectionsDue,
} from "@/features/customer-reminders/Lib/selectReminderCandidates";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

const LOG_PREFIX = "[customer-reminders]";

type CustomerContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type VehicleContact = {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customer: CustomerContact | null;
};

type ReminderCandidate = {
  type: CustomerReminderType;
  dueKey: string;
  dueDate: Date | null;
  vehicle: VehicleContact;
};

type OrgReminderSettings = {
  inspectionEnabled: boolean;
  serviceEnabled: boolean;
  leadDays: number;
  emailWanted: boolean;
  smsWanted: boolean;
  serviceInterval: number;
  approachingThreshold: number;
  locale: Locale;
  templateOverrides: Record<CustomerReminderType, string | null>;
};

function readOrgSettings(rows: { key: string; value: string }[]): OrgReminderSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const leadDaysRaw = Number(map.get(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS));
  const intervalRaw = Number(map.get(SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL));
  const thresholdRaw = Number(map.get(SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD));
  const localeRaw = map.get(SETTING_KEYS.WORKSHOP_LOCALE);

  return {
    // Everything is opt-in: existing organizations must never start
    // messaging customers without flipping the switch themselves.
    inspectionEnabled:
      map.get(SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED) === "true",
    serviceEnabled:
      map.get(SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED) === "true",
    leadDays:
      Number.isFinite(leadDaysRaw) && leadDaysRaw > 0
        ? Math.min(365, Math.round(leadDaysRaw))
        : DEFAULT_INSPECTION_LEAD_DAYS,
    // Email is on by default once reminders are enabled; SMS costs money per
    // message, so it stays an explicit second opt-in.
    emailWanted: map.get(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL) !== "false",
    smsWanted: map.get(SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS) === "true",
    serviceInterval:
      Number.isFinite(intervalRaw) && intervalRaw > 0
        ? intervalRaw
        : DEFAULT_SERVICE_INTERVAL,
    approachingThreshold:
      Number.isFinite(thresholdRaw) && thresholdRaw > 0
        ? thresholdRaw
        : DEFAULT_APPROACHING_THRESHOLD,
    // Cron sends have no browser to negotiate with, so the workshop's own
    // locale is the customer-facing locale (same value forceCustomerLocale
    // applies on share pages).
    locale: locales.includes(localeRaw as Locale) ? (localeRaw as Locale) : defaultLocale,
    templateOverrides: {
      inspection_due: map.get(SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE) ?? null,
      service_due: map.get(SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE) ?? null,
    },
  };
}

function vehicleLabel(vehicle: VehicleContact): string {
  const base = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return vehicle.licensePlate ? `${base} (${vehicle.licensePlate})` : base;
}

function formatDueDate(date: Date | null, locale: Locale): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

async function collectInspectionCandidates(
  organizationId: string,
  now: Date,
  leadDays: number,
): Promise<ReminderCandidate[]> {
  // All inspections carrying a due date for active, customer-owned vehicles;
  // the newest one per vehicle decides whether a reminder is owed.
  const inspections = await db.inspection.findMany({
    where: {
      organizationId,
      nextTestDue: { not: null },
      vehicle: { isArchived: false, customerId: { not: null } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      vehicleId: true,
      nextTestDue: true,
      createdAt: true,
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          customer: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      },
    },
    take: 2000,
  });

  return selectInspectionsDue(inspections, now, leadDays).map((inspection) => ({
    type: "inspection_due" as const,
    dueKey: buildInspectionDueKey(inspection.nextTestDue!),
    dueDate: inspection.nextTestDue,
    vehicle: inspection.vehicle,
  }));
}

async function collectServiceCandidates(
  organizationId: string,
  now: Date,
  serviceInterval: number,
  approachingThreshold: number,
): Promise<ReminderCandidate[]> {
  const vehicles = await db.vehicle.findMany({
    where: {
      organizationId,
      isArchived: false,
      maintenanceDismissed: false,
      customerId: { not: null },
    },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      licensePlate: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      serviceRecords: {
        where: { mileage: { not: null }, status: "completed" },
        orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
        select: { serviceDate: true, startDateTime: true, mileage: true },
      },
    },
    take: 2000,
  });

  const dueKey = buildServiceDueKey(now);
  const candidates: ReminderCandidate[] = [];
  for (const vehicle of vehicles) {
    const evaluation = evaluateServiceDue(
      vehicle.serviceRecords,
      { serviceInterval, approachingThreshold },
      now,
    );
    if (!evaluation) continue;
    candidates.push({
      type: "service_due",
      dueKey,
      dueDate: null,
      vehicle,
    });
  }
  return candidates;
}

async function sendReminderEmail(
  organizationId: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  let from: string;
  try {
    from = await getOrgFromAddress(organizationId);
  } catch (error) {
    console.error(`${LOG_PREFIX} could not resolve sender; skipping email:`, error);
    return false;
  }
  try {
    await sendOrgMail(organizationId, { from, to, subject, html });
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} email to customer failed:`, error);
    return false;
  }
}

/**
 * Sends one reminder SMS, logged to the same table the manual send paths
 * write so it shows up in the customer's message thread.
 */
async function sendReminderSms(
  organizationId: string,
  customer: CustomerContact,
  body: string,
): Promise<boolean> {
  if (!customer.phone) return false;

  const to = await normalizeOrgPhone(organizationId, customer.phone);
  if (!to) return false;

  const fromNumber = await getOrgSmsPhoneNumber(organizationId);
  if (!fromNumber) return false;

  const logged = await db.smsMessage.create({
    data: {
      direction: "outbound",
      fromNumber,
      toNumber: to,
      body,
      status: "queued",
      organizationId,
      customerId: customer.id,
      relatedEntityType: "CustomerReminder",
    },
  });

  try {
    const result = await sendOrgSms(organizationId, { to, body });
    await db.smsMessage.update({
      where: { id: logged.id },
      data: { status: "sent", providerMsgId: result?.providerMsgId ?? null },
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await db.smsMessage.update({
      where: { id: logged.id },
      data: { status: "failed", errorMessage },
    });
    console.error(`${LOG_PREFIX} sms to customer failed:`, errorMessage);
    return false;
  }
}

/**
 * Process one organization: pick eligible vehicles, drop everything already
 * reminded for the same due occurrence, send over the enabled channels, and
 * write the dedupe ledger.
 *
 * Exported so tests and admin tooling can drive it directly.
 */
export async function processOrgCustomerReminders(
  organizationId: string,
  now = new Date(),
) {
  const settingRows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED,
          SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS,
          SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED,
          SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL,
          SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS,
          SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
          SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
          SETTING_KEYS.WORKSHOP_LOCALE,
          SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE,
          SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE,
        ],
      },
    },
    select: { key: true, value: true },
  });

  const settings = readOrgSettings(settingRows);
  if (!settings.inspectionEnabled && !settings.serviceEnabled) {
    return { skipped: true as const };
  }

  // SMS goes out only when the plan includes it AND a provider is configured;
  // a toggle left on after a downgrade must fail closed, not queue errors.
  let smsAllowed = false;
  if (settings.smsWanted) {
    try {
      const features = await getFeatures(organizationId);
      smsAllowed = features.sms && (await getOrgSmsProvider(organizationId)) !== null;
    } catch (error) {
      console.error(`${LOG_PREFIX} could not resolve sms availability:`, error);
    }
  }
  const emailAllowed = settings.emailWanted;

  if (!emailAllowed && !smsAllowed) {
    return { skipped: true as const };
  }

  const candidates: ReminderCandidate[] = [];
  if (settings.inspectionEnabled) {
    candidates.push(
      ...(await collectInspectionCandidates(organizationId, now, settings.leadDays)),
    );
  }
  if (settings.serviceEnabled) {
    candidates.push(
      ...(await collectServiceCandidates(
        organizationId,
        now,
        settings.serviceInterval,
        settings.approachingThreshold,
      )),
    );
  }

  // Customers we cannot reach on any enabled channel are skipped without a
  // ledger row, so they are picked up automatically once contact info lands.
  const reachable = candidates.filter((c) => {
    if (!c.vehicle.customer) return false;
    const canEmail = emailAllowed && !!c.vehicle.customer.email;
    const canSms = smsAllowed && !!c.vehicle.customer.phone;
    return canEmail || canSms;
  });

  if (reachable.length === 0) {
    return { skipped: false as const, sent: 0, failed: 0 };
  }

  // Dedupe against the ledger: one reminder per vehicle + type + occurrence.
  const existing = await db.customerReminderLog.findMany({
    where: {
      organizationId,
      vehicleId: { in: [...new Set(reachable.map((c) => c.vehicle.id))] },
    },
    select: { vehicleId: true, type: true, dueKey: true },
  });
  const alreadyReminded = new Set(
    existing.map((log) => reminderLogKey(log.vehicleId, log.type, log.dueKey)),
  );
  const toSend = reachable.filter(
    (c) => !alreadyReminded.has(reminderLogKey(c.vehicle.id, c.type, c.dueKey)),
  );

  if (toSend.length === 0) {
    return { skipped: false as const, sent: 0, failed: 0 };
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  const companyName = org?.name ?? "your workshop";

  let sent = 0;
  let failed = 0;

  for (const candidate of toSend) {
    const customer = candidate.vehicle.customer!;
    try {
      const message = await buildReminderMessage({
        type: candidate.type,
        locale: settings.locale,
        templateOverride: settings.templateOverrides[candidate.type],
        variables: {
          customer_name: customer.name,
          vehicle: vehicleLabel(candidate.vehicle),
          license_plate: candidate.vehicle.licensePlate ?? "",
          due_date: formatDueDate(candidate.dueDate, settings.locale),
          company_name: companyName,
        },
      });

      const channels: string[] = [];
      if (emailAllowed && customer.email) {
        const ok = await sendReminderEmail(
          organizationId,
          customer.email,
          message.emailSubject,
          message.emailHtml,
        );
        if (ok) channels.push("email");
      }
      if (smsAllowed && customer.phone) {
        const ok = await sendReminderSms(organizationId, customer, message.smsBody);
        if (ok) channels.push("sms");
      }

      // The ledger row is written for failures too: a broken provider must
      // never translate into the same customer being messaged repeatedly.
      await db.customerReminderLog.create({
        data: {
          organizationId,
          vehicleId: candidate.vehicle.id,
          customerId: customer.id,
          type: candidate.type,
          dueKey: candidate.dueKey,
          dueDate: candidate.dueDate,
          channel: channels.join(","),
          status: channels.length > 0 ? "sent" : "failed",
          sentAt: now,
        },
      });

      if (channels.length > 0) sent++;
      else failed++;
    } catch (error) {
      // Unique violation means a concurrent run got there first; anything
      // else is logged and must not stop the rest of the batch.
      const code = (error as { code?: string })?.code;
      if (code !== "P2002") {
        failed++;
        console.error(
          `${LOG_PREFIX} reminder for vehicle ${candidate.vehicle.id} failed:`,
          error,
        );
      }
    }
  }

  if (sent > 0) {
    await notify({
      organizationId,
      type: "customerReminders.sent",
      title: "Customer reminders sent",
      message:
        sent === 1
          ? "1 customer reminder was sent"
          : `${sent} customer reminders were sent`,
      entityType: "CustomerReminderLog",
      entityId: "",
      entityUrl: "/settings/alerts",
    });
  }

  return { skipped: false as const, sent, failed };
}

/** Every organization that switched at least one reminder type on. */
export async function processCustomerReminders(now = new Date()) {
  const enabled = await db.appSetting.findMany({
    where: {
      key: {
        in: [
          SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED,
          SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED,
        ],
      },
      value: "true",
    },
    select: { organizationId: true },
  });

  const orgIds = [...new Set(enabled.map((r) => r.organizationId).filter(Boolean))] as string[];

  let sent = 0;
  for (const organizationId of orgIds) {
    try {
      const result = await processOrgCustomerReminders(organizationId, now);
      if (!result.skipped) sent += result.sent;
    } catch (error) {
      console.error(`${LOG_PREFIX} org ${organizationId} failed:`, error);
    }
  }
  return sent;
}

/** Hourly sweep; the dedupe ledger keeps repeat runs silent. */
export function checkCustomerReminders() {
  const job = new CronJob("40 * * * *", async () => {
    try {
      const sent = await processCustomerReminders();
      if (sent > 0) {
        console.warn(`${LOG_PREFIX} sent ${sent} customer reminder(s)`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} scan failed:`, error);
    }
  });
  job.start();
  console.warn(`${LOG_PREFIX} Customer-reminder processor started (hourly)`);
}
