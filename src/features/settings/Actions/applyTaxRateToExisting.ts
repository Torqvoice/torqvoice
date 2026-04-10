"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { SETTING_KEYS } from "../Schema/settingsSchema";

/**
 * Apply the current default tax rate from settings to existing ServiceRecords
 * and Quotes whose taxRate is still 0 (i.e. created before the default was set
 * or before the taxRate-on-creation fix). Recalculates taxAmount and
 * totalAmount for each updated record.
 *
 * Records with an explicit taxRate > 0 are left untouched so individual
 * overrides are never clobbered.
 */
export async function applyTaxRateToExisting() {
  return withAuth(
    async ({ organizationId }) => {
      // Read current tax settings
      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: [SETTING_KEYS.TAX_ENABLED, SETTING_KEYS.DEFAULT_TAX_RATE] },
        },
      });
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;

      const taxEnabled = settingsMap[SETTING_KEYS.TAX_ENABLED] !== "false";
      const defaultTaxRate = Number(settingsMap[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0;

      if (!taxEnabled || defaultTaxRate <= 0) {
        throw new Error(
          "Tax must be enabled and the default tax rate must be greater than 0.",
        );
      }

      // --- Service records (work orders / invoices) ---
      const serviceRecords = await db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          taxRate: 0,
        },
        select: {
          id: true,
          subtotal: true,
          discountAmount: true,
        },
      });

      // --- Quotes ---
      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          taxRate: 0,
        },
        select: {
          id: true,
          subtotal: true,
          discountAmount: true,
        },
      });

      let serviceRecordsUpdated = 0;
      let quotesUpdated = 0;

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          const base = Math.max(0, r.subtotal - r.discountAmount);
          const taxAmount = base * (defaultTaxRate / 100);
          const totalAmount = base + taxAmount;
          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxRate: defaultTaxRate,
              taxAmount,
              totalAmount,
            },
          });
          serviceRecordsUpdated++;
        }

        for (const q of quotes) {
          const base = Math.max(0, q.subtotal - q.discountAmount);
          const taxAmount = base * (defaultTaxRate / 100);
          const totalAmount = base + taxAmount;
          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxRate: defaultTaxRate,
              taxAmount,
              totalAmount,
            },
          });
          quotesUpdated++;
        }
      });

      revalidatePath("/work-orders");
      revalidatePath("/quotes");
      revalidatePath("/vehicles");

      return {
        serviceRecordsUpdated,
        quotesUpdated,
        taxRate: defaultTaxRate,
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "settings.applyTaxRate",
        entity: "Organization",
        message: `Applied ${result.taxRate}% tax to ${result.serviceRecordsUpdated} service records and ${result.quotesUpdated} quotes`,
        metadata: {
          taxRate: result.taxRate,
          serviceRecordsUpdated: result.serviceRecordsUpdated,
          quotesUpdated: result.quotesUpdated,
        },
      }),
    },
  );
}

/**
 * Count existing records eligible for the tax backfill (taxRate = 0).
 * Used so the UI can show how many records the button will affect.
 */
export async function getTaxBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { vehicle: { organizationId }, taxRate: 0 },
        }),
        db.quote.count({
          where: { organizationId, taxRate: 0 },
        }),
      ]);
      return { serviceRecords, quotes };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
