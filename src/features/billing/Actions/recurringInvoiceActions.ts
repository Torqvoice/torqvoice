"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  createRecurringInvoiceSchema,
  updateRecurringInvoiceSchema,
  type CreateRecurringInvoiceInput,
  type UpdateRecurringInvoiceInput,
} from "../Schema/recurringInvoiceSchema";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";

export async function getRecurringInvoices() {
  return withAuth(async ({ organizationId }) => {
    const invoices = await db.recurringInvoice.findMany({
      where: { vehicle: { organizationId } },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            customer: { select: { id: true, name: true } },
          },
        },
        templateParts: true,
        templateLabor: true,
      },
      orderBy: { nextRunDate: "asc" },
    });

    return invoices;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] });
}

export async function createRecurringInvoice(input: CreateRecurringInvoiceInput) {
  return withAuth(async ({ organizationId }) => {
    const parsed = createRecurringInvoiceSchema.parse(input);

    // Verify vehicle belongs to org
    const vehicle = await db.vehicle.findFirst({
      where: { id: parsed.vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    const invoice = await db.recurringInvoice.create({
      data: {
        title: parsed.title,
        description: parsed.description,
        frequency: parsed.frequency,
        nextRunDate: new Date(parsed.nextRunDate),
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        vehicleId: parsed.vehicleId,
        type: parsed.type,
        cost: parsed.cost,
        taxRate: parsed.taxRate,
        invoiceNotes: parsed.invoiceNotes,
        templateParts: {
          create: parsed.templateParts.map((p) => ({
            name: p.name,
            partNumber: p.partNumber,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
          })),
        },
        templateLabor: {
          create: parsed.templateLabor.map((l) => ({
            description: l.description,
            hours: l.hours,
            rate: l.rate,
          })),
        },
      },
    });

    revalidatePath("/billing/recurring");
    return invoice;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.BILLING }] });
}

export async function updateRecurringInvoice(input: UpdateRecurringInvoiceInput) {
  return withAuth(async ({ organizationId }) => {
    const parsed = updateRecurringInvoiceSchema.parse(input);

    const existing = await db.recurringInvoice.findFirst({
      where: { id: parsed.id, vehicle: { organizationId } },
    });
    if (!existing) throw new Error("Recurring invoice not found");

    if (parsed.vehicleId) {
      const vehicle = await db.vehicle.findFirst({
        where: { id: parsed.vehicleId, organizationId },
      });
      if (!vehicle) throw new Error("Vehicle not found");
    }

    // Update main record
    const updated = await db.$transaction(async (tx) => {
      // Delete existing template items if new ones provided
      if (parsed.templateParts) {
        await tx.recurringPart.deleteMany({ where: { recurringInvoiceId: parsed.id } });
      }
      if (parsed.templateLabor) {
        await tx.recurringLabor.deleteMany({ where: { recurringInvoiceId: parsed.id } });
      }

      return tx.recurringInvoice.update({
        where: { id: parsed.id },
        data: {
          ...(parsed.title !== undefined && { title: parsed.title }),
          ...(parsed.description !== undefined && { description: parsed.description }),
          ...(parsed.frequency !== undefined && { frequency: parsed.frequency }),
          ...(parsed.nextRunDate !== undefined && { nextRunDate: new Date(parsed.nextRunDate) }),
          ...(parsed.endDate !== undefined && { endDate: parsed.endDate ? new Date(parsed.endDate) : null }),
          ...(parsed.vehicleId !== undefined && { vehicleId: parsed.vehicleId }),
          ...(parsed.type !== undefined && { type: parsed.type }),
          ...(parsed.cost !== undefined && { cost: parsed.cost }),
          ...(parsed.taxRate !== undefined && { taxRate: parsed.taxRate }),
          ...(parsed.invoiceNotes !== undefined && { invoiceNotes: parsed.invoiceNotes }),
          ...(parsed.templateParts && {
            templateParts: {
              create: parsed.templateParts.map((p) => ({
                name: p.name,
                partNumber: p.partNumber,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
              })),
            },
          }),
          ...(parsed.templateLabor && {
            templateLabor: {
              create: parsed.templateLabor.map((l) => ({
                description: l.description,
                hours: l.hours,
                rate: l.rate,
              })),
            },
          }),
        },
      });
    });

    revalidatePath("/billing/recurring");
    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.BILLING }] });
}

export async function deleteRecurringInvoice(id: string) {
  return withAuth(async ({ organizationId }) => {
    const existing = await db.recurringInvoice.findFirst({
      where: { id, vehicle: { organizationId } },
    });
    if (!existing) throw new Error("Recurring invoice not found");

    await db.recurringInvoice.delete({ where: { id } });

    revalidatePath("/billing/recurring");
    return { deleted: true };
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.BILLING }] });
}

export async function toggleRecurringInvoice(id: string) {
  return withAuth(async ({ organizationId }) => {
    const existing = await db.recurringInvoice.findFirst({
      where: { id, vehicle: { organizationId } },
    });
    if (!existing) throw new Error("Recurring invoice not found");

    const updated = await db.recurringInvoice.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    revalidatePath("/billing/recurring");
    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.BILLING }] });
}

function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

async function generateInvoiceNumber(organizationId: string): Promise<string> {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ["workshop.invoicePrefix", "workshop.invoiceStartNumber"] },
    },
  });

  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const prefix = resolveInvoicePrefix(settingsMap["workshop.invoicePrefix"] || "{year}-");
  const startNumber = parseInt(settingsMap["workshop.invoiceStartNumber"] || "0", 10);

  const lastRecord = await db.serviceRecord.findFirst({
    where: { vehicle: { organizationId } },
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });

  let nextNum = startNumber || 1001;
  if (lastRecord?.invoiceNumber) {
    const match = lastRecord.invoiceNumber.match(/(\d+)$/);
    if (match) {
      const lastNum = parseInt(match[1], 10) + 1;
      nextNum = Math.max(nextNum, lastNum);
    }
  }

  return `${prefix}${nextNum}`;
}

export async function processRecurringInvoices() {
  return withAuth(async ({ organizationId }) => {
    const now = new Date();

    const dueInvoices = await db.recurringInvoice.findMany({
      where: {
        isActive: true,
        nextRunDate: { lte: now },
        vehicle: { organizationId },
      },
      include: {
        templateParts: true,
        templateLabor: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    const results: { id: string; serviceRecordId: string }[] = [];

    for (const ri of dueInvoices) {
      const invoiceNumber = await generateInvoiceNumber(organizationId);

      // Calculate totals
      const partsSubtotal = ri.templateParts.reduce(
        (s, p) => s + p.quantity * p.unitPrice,
        0,
      );
      const laborSubtotal = ri.templateLabor.reduce(
        (s, l) => s + l.hours * l.rate,
        0,
      );
      const subtotal = ri.cost + partsSubtotal + laborSubtotal;
      const taxAmount = subtotal * (ri.taxRate / 100);
      const totalAmount = subtotal + taxAmount;

      const serviceRecord = await db.$transaction(async (tx) => {
        const sr = await tx.serviceRecord.create({
          data: {
            title: ri.title,
            description: ri.description,
            type: ri.type,
            status: "completed",
            cost: ri.cost,
            serviceDate: now,
            invoiceNotes: ri.invoiceNotes,
            subtotal,
            taxRate: ri.taxRate,
            taxAmount,
            totalAmount,
            invoiceNumber,
            vehicleId: ri.vehicleId,
            partItems: {
              create: ri.templateParts.map((p) => ({
                name: p.name,
                partNumber: p.partNumber,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                total: p.quantity * p.unitPrice,
              })),
            },
            laborItems: {
              create: ri.templateLabor.map((l) => ({
                description: l.description,
                hours: l.hours,
                rate: l.rate,
                total: l.hours * l.rate,
              })),
            },
          },
        });

        // Update recurring invoice
        const nextRunDate = calculateNextRunDate(ri.nextRunDate, ri.frequency);
        const shouldDeactivate = ri.endDate && nextRunDate > ri.endDate;

        await tx.recurringInvoice.update({
          where: { id: ri.id },
          data: {
            lastRunAt: now,
            runCount: { increment: 1 },
            nextRunDate,
            ...(shouldDeactivate && { isActive: false }),
          },
        });

        return sr;
      });

      results.push({ id: ri.id, serviceRecordId: serviceRecord.id });
    }

    revalidatePath("/billing");
    revalidatePath("/billing/recurring");

    return { processed: results.length, results };
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.BILLING }] });
}
