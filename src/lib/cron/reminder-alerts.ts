import { CronJob } from "cron";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";

const LOG_PREFIX = "[reminder-alerts]";

type DueReminder = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  organizationId: string | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
    customer: { name: string } | null;
  } | null;
};

/** What the reminder relates to: vehicle, customer, or the workshop itself. */
function targetLabel(r: DueReminder) {
  if (r.vehicle) {
    const base = `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`;
    return r.vehicle.licensePlate ? `${base} (${r.vehicle.licensePlate})` : base;
  }
  return r.customer?.name ?? null;
}

function targetUrl(r: DueReminder) {
  if (r.vehicle) return `/vehicles/${r.vehicle.id}?tab=reminders`;
  if (r.customer) return `/customers/${r.customer.id}`;
  return "/reminders";
}

/** Owners and admins receive the email. */
async function getRecipients(organizationId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ["owner", "admin"] } },
    select: { user: { select: { email: true, name: true } } },
  });
  return members
    .map((m) => m.user)
    .filter((u): u is { email: string; name: string } => !!u?.email);
}

async function sendReminderEmail(organizationId: string, reminders: DueReminder[]) {
  const recipients = await getRecipients(organizationId);
  if (recipients.length === 0) return;

  // Resolving the sender reads the org's email provider settings — exactly
  // what is broken when email is misconfigured. Skip rather than invent an
  // address; the in-app notification (if chosen) has already gone out.
  let fromAddress: string;
  try {
    fromAddress = await getOrgFromAddress(organizationId);
  } catch (error) {
    console.error(`${LOG_PREFIX} could not resolve sender; skipping email:`, error);
    return;
  }

  const rows = reminders
    .map(
      (r) =>
        `<li style="margin-bottom:6px;"><strong>${r.title}</strong>${
          targetLabel(r) ? ` — ${targetLabel(r)}` : ""
        }${r.vehicle?.customer ? ` · ${r.vehicle.customer.name}` : ""}${
          r.description ? `<br/><span style="color:#666;">${r.description}</span>` : ""
        }</li>`,
    )
    .join("");

  const subject =
    reminders.length === 1
      ? `Reminder due: ${reminders[0].title}`
      : `${reminders.length} reminders due`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2 style="margin-bottom: 4px;">${subject}</h2>
      <ul style="padding-left: 18px;">${rows}</ul>
      <p style="color: #666; font-size: 13px;">Open Torqvoice to complete or reschedule the reminder.</p>
    </div>`;

  for (const recipient of recipients) {
    await sendOrgMail(organizationId, {
      from: fromAddress,
      to: recipient.email,
      subject,
      html,
    });
  }
}

/**
 * Notifies about reminders whose due date has arrived, on the channels chosen
 * when the reminder was created (bell and/or email). Each reminder notifies
 * exactly once; rescheduling (changing dueDate) re-arms it.
 */
export async function processDueReminders(now = new Date()) {
  const due = (await db.reminder.findMany({
    where: {
      isCompleted: false,
      notifiedAt: null,
      dueDate: { not: null, lte: now },
      OR: [{ notifyInApp: true }, { notifyEmail: true }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      notifyInApp: true,
      notifyEmail: true,
      organizationId: true,
      customer: { select: { id: true, name: true } },
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          customer: { select: { name: true } },
        },
      },
    },
    take: 500,
  })) as DueReminder[];

  if (due.length === 0) return 0;

  // Group by organization so email becomes one digest per org per run
  const byOrg = new Map<string, DueReminder[]>();
  for (const r of due) {
    const orgId = r.organizationId;
    if (!orgId) continue;
    const list = byOrg.get(orgId) ?? [];
    list.push(r);
    byOrg.set(orgId, list);
  }

  let notified = 0;
  for (const [organizationId, reminders] of byOrg) {
    // Bell: one notification per reminder, each linking to its vehicle
    for (const r of reminders) {
      if (!r.notifyInApp) continue;
      await notify({
        organizationId,
        type: "reminder.due",
        title: "Reminder Due",
        message: targetLabel(r) ? `${r.title} — ${targetLabel(r)}` : r.title,
        entityType: "Reminder",
        entityId: r.id,
        entityUrl: targetUrl(r),
      });
    }

    // Email: one digest for the reminders that asked for it. Best-effort and
    // isolated — a broken mail setup must not stop notifiedAt from being set,
    // or the same reminders would be re-processed (and re-belled) every run.
    const emailReminders = reminders.filter((r) => r.notifyEmail);
    if (emailReminders.length > 0) {
      try {
        await sendReminderEmail(organizationId, emailReminders);
      } catch (error) {
        console.error(`${LOG_PREFIX} email failed for org ${organizationId}:`, error);
      }
    }

    notified += reminders.length;
  }

  await db.reminder.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { notifiedAt: now },
  });

  return notified;
}

/** Hourly scan for reminders that have come due. */
export function checkDueReminders() {
  const job = new CronJob("25 * * * *", async () => {
    try {
      const notified = await processDueReminders();
      if (notified > 0) {
        console.warn(`${LOG_PREFIX} notified on ${notified} due reminder(s)`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} scan failed:`, error);
    }
  });
  job.start();
  console.warn(`${LOG_PREFIX} Due-reminder processor started (hourly)`);
}
