"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const deleteContentSchema = z.object({
  vehicles: z.boolean().default(false),
  customers: z.boolean().default(false),
  quotes: z.boolean().default(false),
  inventory: z.boolean().default(false),
});

export async function deleteContent(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    if (!organizationId) {
      throw new Error("No organization found");
    }

    const selections = deleteContentSchema.parse(input);

    if (!selections.vehicles && !selections.customers && !selections.quotes && !selections.inventory) {
      throw new Error("No content types selected");
    }

    const deleted: string[] = [];
    const filesToClean: string[] = [];

    // --- Vehicles ---
    // Cascades: ServiceRecord (-> PartItem, LaborItem, ServiceAttachment, Payment),
    //           Note, FuelLog, Reminder, Quote (vehicle-linked), RecurringInvoice
    if (selections.vehicles) {
      // Collect files to clean up
      const vehicleImages = await db.vehicle.findMany({
        where: { organizationId },
        select: { imageUrl: true },
      });
      for (const v of vehicleImages) {
        if (v.imageUrl) filesToClean.push(resolveUploadPath(v.imageUrl));
      }

      const attachments = await db.serviceAttachment.findMany({
        where: { serviceRecord: { vehicle: { organizationId } } },
        select: { fileUrl: true },
      });
      for (const att of attachments) {
        filesToClean.push(resolveUploadPath(att.fileUrl));
      }

      await db.vehicle.deleteMany({ where: { organizationId } });
      deleted.push("vehicles");
    }

    // --- Quotes ---
    // Cascades: QuotePart, QuoteLabor
    // If vehicles were already deleted, vehicle-linked quotes are gone via cascade.
    // This handles org-level quotes (and any remaining if vehicles weren't deleted).
    if (selections.quotes) {
      await db.quote.deleteMany({ where: { organizationId } });
      deleted.push("quotes");
    }

    // --- Customers ---
    // Vehicles with this customer get customerId set to null (SetNull).
    // Quotes with this customer get customerId set to null (SetNull).
    if (selections.customers) {
      await db.customer.deleteMany({ where: { organizationId } });
      deleted.push("customers");
    }

    // --- Inventory ---
    if (selections.inventory) {
      const parts = await db.inventoryPart.findMany({
        where: { organizationId },
        select: { imageUrl: true },
      });
      for (const part of parts) {
        if (part.imageUrl) filesToClean.push(resolveUploadPath(part.imageUrl));
      }

      await db.inventoryPart.deleteMany({ where: { organizationId } });
      deleted.push("inventory");
    }

    // Clean up files from disk (best effort)
    for (const filePath of filesToClean) {
      try {
        await unlink(filePath);
      } catch {
        // File may already be missing
      }
    }

    revalidatePath("/");
    revalidatePath("/vehicles");
    revalidatePath("/customers");
    revalidatePath("/quotes");
    revalidatePath("/inventory");
    revalidatePath("/settings/account");

    return { deleted };
  });
}

export async function getContentCounts() {
  return withAuth(async ({ organizationId }) => {
    if (!organizationId) {
      return { vehicles: 0, customers: 0, quotes: 0, inventory: 0 };
    }

    const [vehicles, customers, quotes, inventory] = await Promise.all([
      db.vehicle.count({ where: { organizationId } }),
      db.customer.count({ where: { organizationId } }),
      db.quote.count({ where: { organizationId } }),
      db.inventoryPart.count({ where: { organizationId } }),
    ]);

    return { vehicles, customers, quotes, inventory };
  });
}
