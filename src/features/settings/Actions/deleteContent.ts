"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { demoGuard } from "@/lib/demo";

const deleteContentSchema = z.object({
  vehicles: z.boolean().default(false),
  customers: z.boolean().default(false),
  quotes: z.boolean().default(false),
  inventory: z.boolean().default(false),
  inspections: z.boolean().default(false),
  technicians: z.boolean().default(false),
  inspectionTemplates: z.boolean().default(false),
  notifications: z.boolean().default(false),
  smsMessages: z.boolean().default(false),
  customFields: z.boolean().default(false),
});

export async function deleteContent(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    demoGuard()
    if (!organizationId) {
      throw new Error("No organization found");
    }

    const selections = deleteContentSchema.parse(input);

    if (!Object.values(selections).some(Boolean)) {
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

    // --- Inspections ---
    // Cascades: InspectionItem, InspectionQuoteRequest
    if (selections.inspections) {
      await db.inspection.deleteMany({ where: { organizationId } });
      deleted.push("inspections");
    }

    // --- Technicians ---
    // ServiceRecords/Inspections with this technician get technicianId set to null (SetNull).
    if (selections.technicians) {
      await db.technician.deleteMany({ where: { organizationId } });
      deleted.push("technicians");
    }

    // --- Inspection Templates ---
    // Cascades: InspectionTemplateSection -> InspectionTemplateItem
    // Inspections reference templates (no cascade), so delete remaining inspections first.
    if (selections.inspectionTemplates) {
      if (!selections.inspections) {
        await db.inspection.deleteMany({ where: { organizationId } });
        deleted.push("inspections");
      }
      await db.inspectionTemplate.deleteMany({ where: { organizationId } });
      deleted.push("inspectionTemplates");
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

    // --- Notifications ---
    if (selections.notifications) {
      await db.notification.deleteMany({ where: { organizationId } });
      deleted.push("notifications");
    }

    // --- SMS Messages ---
    if (selections.smsMessages) {
      await db.smsMessage.deleteMany({ where: { organizationId } });
      deleted.push("smsMessages");
    }

    // --- Custom Fields ---
    // Cascades: CustomFieldValue
    if (selections.customFields) {
      await db.customFieldDefinition.deleteMany({ where: { organizationId } });
      deleted.push("customFields");
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
    revalidatePath("/inspections");
    revalidatePath("/technicians");
    revalidatePath("/settings");
    revalidatePath("/settings/account");

    return { deleted };
  }, {
    audit: ({ result }) => ({
      action: "settings.deleteContent",
      entity: "Organization",
      message: `Deleted all data: ${result.deleted.join(", ")}`,
      metadata: { deleted: result.deleted },
    }),
  });
}

export async function getContentCounts() {
  return withAuth(async ({ organizationId }) => {
    if (!organizationId) {
      return {
        vehicles: 0, customers: 0, quotes: 0, inventory: 0,
        inspections: 0, technicians: 0, inspectionTemplates: 0,
        notifications: 0, smsMessages: 0, customFields: 0,
      };
    }

    const [
      vehicles, customers, quotes, inventory,
      inspections, technicians, inspectionTemplates,
      notifications, smsMessages, customFields,
    ] = await Promise.all([
      db.vehicle.count({ where: { organizationId } }),
      db.customer.count({ where: { organizationId } }),
      db.quote.count({ where: { organizationId } }),
      db.inventoryPart.count({ where: { organizationId } }),
      db.inspection.count({ where: { organizationId } }),
      db.technician.count({ where: { organizationId } }),
      db.inspectionTemplate.count({ where: { organizationId } }),
      db.notification.count({ where: { organizationId } }),
      db.smsMessage.count({ where: { organizationId } }),
      db.customFieldDefinition.count({ where: { organizationId } }),
    ]);

    return {
      vehicles, customers, quotes, inventory,
      inspections, technicians, inspectionTemplates,
      notifications, smsMessages, customFields,
    };
  });
}
