"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import {
  CHECKLIST_DISMISSED_KEY,
  INVOICE_ISSUED_KEY,
  SAMPLE_DATA_IDS_KEY,
  hasAnySampleIds,
  parseSampleDataIds,
} from "../Lib/onboardingKeys";

export interface OnboardingChecklistData {
  steps: {
    customer: boolean;
    vehicle: boolean;
    workOrder: boolean;
    invoice: boolean;
  };
  allDone: boolean;
  hasSampleData: boolean;
}

/**
 * The dashboard's getting-started card state.
 *
 * Completion is detected from live data counts, with the seeded sample rows
 * excluded so each step means the user really did the thing. Returns null
 * when the card should not render: the user dismissed it, or the org
 * predates the checklist (no dismissed-marker row) and already does all of
 * this anyway.
 */
export async function getOnboardingChecklist() {
  return withAuth(async ({ organizationId }): Promise<OnboardingChecklistData | null> => {
    const settings = await db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [SAMPLE_DATA_IDS_KEY, CHECKLIST_DISMISSED_KEY, INVOICE_ISSUED_KEY],
        },
      },
      select: { key: true, value: true },
    });
    const byKey = new Map(settings.map((s) => [s.key, s.value]));

    if (byKey.get(CHECKLIST_DISMISSED_KEY) === "true") return null;

    const sampleIds = parseSampleDataIds(byKey.get(SAMPLE_DATA_IDS_KEY));

    const [customers, vehicles, workOrders, sharedInvoices] = await Promise.all([
      db.customer.count({
        where: { organizationId, id: { notIn: sampleIds.customers } },
      }),
      db.vehicle.count({
        where: { organizationId, id: { notIn: sampleIds.vehicles } },
      }),
      db.serviceRecord.count({
        where: { organizationId, id: { notIn: sampleIds.serviceRecords } },
      }),
      db.serviceRecord.count({
        where: {
          organizationId,
          id: { notIn: sampleIds.serviceRecords },
          sharedAt: { not: null },
        },
      }),
    ]);

    const steps = {
      customer: customers > 0,
      vehicle: vehicles > 0,
      workOrder: workOrders > 0,
      invoice: sharedInvoices > 0 || byKey.get(INVOICE_ISSUED_KEY) === "true",
    };
    const allDone = Object.values(steps).every(Boolean);

    // Orgs created before the checklist existed have no dismissed-marker row.
    // If they already do everything, there is nothing to onboard.
    if (allDone && !byKey.has(CHECKLIST_DISMISSED_KEY)) return null;

    return {
      steps,
      allDone,
      hasSampleData: hasAnySampleIds(sampleIds),
    };
  });
}

export async function dismissOnboardingChecklist() {
  return withAuth(async ({ organizationId, userId }) => {
    await db.appSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: CHECKLIST_DISMISSED_KEY },
      },
      create: {
        organizationId,
        key: CHECKLIST_DISMISSED_KEY,
        value: "true",
        userId,
      },
      update: { value: "true" },
    });
    revalidatePath("/");
    return { dismissed: true };
  });
}

/**
 * Deletes exactly the entities the onboarding seed created, then clears the
 * marker. Order respects the FK graph: jobs and quotes first (they reference
 * inspections and vehicles), then inspections, vehicles and customers. All
 * deletes are scoped to the organization on top of the recorded ids.
 */
export async function removeSampleData() {
  return withAuth(async ({ organizationId }) => {
    const row = await db.appSetting.findFirst({
      where: { organizationId, key: SAMPLE_DATA_IDS_KEY },
      select: { id: true, value: true },
    });
    const ids = parseSampleDataIds(row?.value);
    if (!row || !hasAnySampleIds(ids)) {
      if (row) await db.appSetting.delete({ where: { id: row.id } });
      return { removed: false };
    }

    await db.$transaction([
      db.serviceRecord.deleteMany({
        where: { organizationId, id: { in: ids.serviceRecords } },
      }),
      db.quote.deleteMany({
        where: { organizationId, id: { in: ids.quotes } },
      }),
      db.inspection.deleteMany({
        where: { organizationId, id: { in: ids.inspections } },
      }),
      db.vehicle.deleteMany({
        where: { organizationId, id: { in: ids.vehicles } },
      }),
      db.customer.deleteMany({
        where: { organizationId, id: { in: ids.customers } },
      }),
      db.appSetting.delete({ where: { id: row.id } }),
    ]);

    revalidatePath("/");
    revalidatePath("/customers");
    revalidatePath("/vehicles");
    revalidatePath("/work-orders");
    revalidatePath("/quotes");
    revalidatePath("/inspections");
    return { removed: true };
  }, {
    audit: () => ({
      action: "organization.sampleDataRemove",
      entity: "Organization",
      message: "Removed onboarding sample data",
    }),
  });
}
