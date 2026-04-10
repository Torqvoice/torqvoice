"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { SETTING_KEYS } from "../Schema/settingsSchema";
import { calculateTotals } from "@/lib/tax";

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
          taxInclusive: true,
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
          taxInclusive: true,
        },
      });

      let serviceRecordsUpdated = 0;
      let quotesUpdated = 0;

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: r.subtotal,
            discountAmount: r.discountAmount,
            taxRate: defaultTaxRate,
            taxInclusive: r.taxInclusive,
          });
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
          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: q.subtotal,
            discountAmount: q.discountAmount,
            taxRate: defaultTaxRate,
            taxInclusive: q.taxInclusive,
          });
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

/**
 * Count existing exclusive-mode records that can be converted to inclusive.
 */
export async function getInclusiveBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { vehicle: { organizationId }, taxInclusive: false },
        }),
        db.quote.count({
          where: { organizationId, taxInclusive: false },
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

/**
 * Count existing inclusive-mode records that can be converted back to exclusive.
 */
export async function getExclusiveBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { vehicle: { organizationId }, taxInclusive: true },
        }),
        db.quote.count({
          where: { organizationId, taxInclusive: true },
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

/**
 * Convert existing exclusive-tax ServiceRecords and Quotes to inclusive mode.
 *
 * Behaviour: scale every line item price upward by `(1 + taxRate / 100)` so
 * the gross customer-facing total stays IDENTICAL after the conversion. The
 * record's `taxInclusive` flag is set to true; `taxAmount` and `totalAmount`
 * are recomputed via the helper (and should match what was stored before).
 *
 * - Records with `taxInclusive = true` are skipped.
 * - Records with `taxRate = 0` are flag-flipped only (no math needed).
 * - Percentage discounts keep their percent value; the resulting
 *   `discountAmount` scales naturally with the bigger subtotal.
 * - Fixed discounts have their `discountValue` AND `discountAmount` scaled,
 *   so the customer still gets the same effective discount.
 *
 * This is irreversible from a data-shape perspective: the line item prices
 * shown on past invoices will change to display gross prices, even though
 * the customer paid the same total.
 */
export async function convertRecordsToInclusive() {
  return withAuth(
    async ({ organizationId }) => {
      // --- Service records ---
      const serviceRecords = await db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          taxInclusive: false,
        },
        select: {
          id: true,
          subtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          partItems: { select: { id: true, unitPrice: true, total: true } },
          laborItems: { select: { id: true, rate: true, total: true } },
        },
      });

      // --- Quotes ---
      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          taxInclusive: false,
        },
        select: {
          id: true,
          subtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          partItems: { select: { id: true, unitPrice: true, total: true } },
          laborItems: { select: { id: true, rate: true, total: true } },
        },
      });

      let serviceRecordsUpdated = 0;
      let quotesUpdated = 0;

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          const factor = 1 + r.taxRate / 100;
          const newSubtotal = r.subtotal * factor;
          const newDiscountAmount = r.discountAmount * factor;
          // Fixed discount: scale discountValue too. Percentage: leave it alone.
          const newDiscountValue =
            r.discountType === "fixed" ? r.discountValue * factor : r.discountValue;

          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: newSubtotal,
            discountAmount: newDiscountAmount,
            taxRate: r.taxRate,
            taxInclusive: true,
          });

          if (r.taxRate > 0) {
            for (const p of r.partItems) {
              await tx.servicePart.update({
                where: { id: p.id },
                data: { unitPrice: p.unitPrice * factor, total: p.total * factor },
              });
            }
            for (const l of r.laborItems) {
              await tx.serviceLabor.update({
                where: { id: l.id },
                data: { rate: l.rate * factor, total: l.total * factor },
              });
            }
          }

          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxInclusive: true,
              subtotal: newSubtotal,
              discountValue: newDiscountValue,
              discountAmount: newDiscountAmount,
              taxAmount,
              totalAmount,
            },
          });
          serviceRecordsUpdated++;
        }

        for (const q of quotes) {
          const factor = 1 + q.taxRate / 100;
          const newSubtotal = q.subtotal * factor;
          const newDiscountAmount = q.discountAmount * factor;
          const newDiscountValue =
            q.discountType === "fixed" ? q.discountValue * factor : q.discountValue;

          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: newSubtotal,
            discountAmount: newDiscountAmount,
            taxRate: q.taxRate,
            taxInclusive: true,
          });

          if (q.taxRate > 0) {
            for (const p of q.partItems) {
              await tx.quotePart.update({
                where: { id: p.id },
                data: { unitPrice: p.unitPrice * factor, total: p.total * factor },
              });
            }
            for (const l of q.laborItems) {
              await tx.quoteLabor.update({
                where: { id: l.id },
                data: { rate: l.rate * factor, total: l.total * factor },
              });
            }
          }

          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxInclusive: true,
              subtotal: newSubtotal,
              discountValue: newDiscountValue,
              discountAmount: newDiscountAmount,
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

      return { serviceRecordsUpdated, quotesUpdated };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "settings.convertToInclusive",
        entity: "Organization",
        message: `Converted ${result.serviceRecordsUpdated} service records and ${result.quotesUpdated} quotes to inclusive tax mode`,
        metadata: result,
      }),
    },
  );
}

/**
 * Convert existing inclusive-tax ServiceRecords and Quotes back to exclusive
 * mode. Mirror of `convertRecordsToInclusive`.
 *
 * Behaviour: scale every line item price downward by `(1 + taxRate / 100)` so
 * the gross customer-facing total stays IDENTICAL after the conversion. The
 * record's `taxInclusive` flag is set to false; `taxAmount` and `totalAmount`
 * are recomputed via the helper.
 *
 * - Records with `taxInclusive = false` are skipped.
 * - Records with `taxRate = 0` are flag-flipped only (factor = 1).
 * - Percentage discounts keep their percent value; the resulting
 *   `discountAmount` scales naturally with the smaller subtotal.
 * - Fixed discounts have their `discountValue` AND `discountAmount` scaled,
 *   so the customer still gets the same effective discount.
 *
 * After conversion the printed line item prices on past invoices appear LOWER
 * because they now show the pre-tax amount. The customer paid the same total.
 */
export async function convertRecordsToExclusive() {
  return withAuth(
    async ({ organizationId }) => {
      const serviceRecords = await db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          taxInclusive: true,
        },
        select: {
          id: true,
          subtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          partItems: { select: { id: true, unitPrice: true, total: true } },
          laborItems: { select: { id: true, rate: true, total: true } },
        },
      });

      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          taxInclusive: true,
        },
        select: {
          id: true,
          subtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          partItems: { select: { id: true, unitPrice: true, total: true } },
          laborItems: { select: { id: true, rate: true, total: true } },
        },
      });

      let serviceRecordsUpdated = 0;
      let quotesUpdated = 0;

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          const factor = 1 + r.taxRate / 100;
          const newSubtotal = r.subtotal / factor;
          const newDiscountAmount = r.discountAmount / factor;
          const newDiscountValue =
            r.discountType === "fixed" ? r.discountValue / factor : r.discountValue;

          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: newSubtotal,
            discountAmount: newDiscountAmount,
            taxRate: r.taxRate,
            taxInclusive: false,
          });

          if (r.taxRate > 0) {
            for (const p of r.partItems) {
              await tx.servicePart.update({
                where: { id: p.id },
                data: { unitPrice: p.unitPrice / factor, total: p.total / factor },
              });
            }
            for (const l of r.laborItems) {
              await tx.serviceLabor.update({
                where: { id: l.id },
                data: { rate: l.rate / factor, total: l.total / factor },
              });
            }
          }

          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxInclusive: false,
              subtotal: newSubtotal,
              discountValue: newDiscountValue,
              discountAmount: newDiscountAmount,
              taxAmount,
              totalAmount,
            },
          });
          serviceRecordsUpdated++;
        }

        for (const q of quotes) {
          const factor = 1 + q.taxRate / 100;
          const newSubtotal = q.subtotal / factor;
          const newDiscountAmount = q.discountAmount / factor;
          const newDiscountValue =
            q.discountType === "fixed" ? q.discountValue / factor : q.discountValue;

          const { taxAmount, totalAmount } = calculateTotals({
            subtotal: newSubtotal,
            discountAmount: newDiscountAmount,
            taxRate: q.taxRate,
            taxInclusive: false,
          });

          if (q.taxRate > 0) {
            for (const p of q.partItems) {
              await tx.quotePart.update({
                where: { id: p.id },
                data: { unitPrice: p.unitPrice / factor, total: p.total / factor },
              });
            }
            for (const l of q.laborItems) {
              await tx.quoteLabor.update({
                where: { id: l.id },
                data: { rate: l.rate / factor, total: l.total / factor },
              });
            }
          }

          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxInclusive: false,
              subtotal: newSubtotal,
              discountValue: newDiscountValue,
              discountAmount: newDiscountAmount,
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

      return { serviceRecordsUpdated, quotesUpdated };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: "settings.convertToExclusive",
        entity: "Organization",
        message: `Converted ${result.serviceRecordsUpdated} service records and ${result.quotesUpdated} quotes to exclusive tax mode`,
        metadata: result,
      }),
    },
  );
}
