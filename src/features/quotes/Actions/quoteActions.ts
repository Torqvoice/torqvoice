"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createQuoteSchema, updateQuoteSchema } from "../Schema/quoteSchema";
import { revalidatePath } from "next/cache";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getQuotesPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  return withAuth(async ({ userId, organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };

    if (params.status && params.status !== "all") {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { quoteNumber: { contains: params.search, mode: "insensitive" } },
        { customer: { name: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    const [records, total, statusCounts] = await Promise.all([
      db.quote.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          vehicle: { select: { id: true, make: true, model: true, year: true, licensePlate: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.quote.count({ where }),
      db.quote.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: true,
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of statusCounts) {
      counts[g.status] = g._count;
    }

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts: counts,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] });
}

export async function getQuote(quoteId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: {
        partItems: true,
        laborItems: true,
        customer: {
          select: { id: true, name: true, email: true, phone: true, address: true, company: true },
        },
        vehicle: {
          select: { id: true, make: true, model: true, year: true, vin: true, licensePlate: true, mileage: true },
        },
        inspection: {
          select: { id: true },
        },
      },
    });
    if (!quote) throw new Error("Quote not found");
    return quote;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] });
}

export async function createQuote(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createQuoteSchema.parse(input);

    // Generate quote number
    const settings = await db.appSetting.findMany({
      where: { organizationId, key: { in: ["workshop.quotePrefix"] } },
    });
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;
    const prefix = settingsMap["workshop.quotePrefix"] || "QT-";

    const lastQuote = await db.quote.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { quoteNumber: true },
    });
    let nextNum = 1001;
    if (lastQuote?.quoteNumber) {
      const match = lastQuote.quoteNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const quoteNumber = `${prefix}${nextNum}`;

    const { partItems, laborItems, ...quoteData } = data;

    const quote = await db.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          ...quoteData,
          quoteNumber,
          userId,
          organizationId,
          validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
          discountType: quoteData.discountType === "none" ? null : quoteData.discountType,
        },
      });

      if (partItems && partItems.length > 0) {
        await tx.quotePart.createMany({
          data: partItems.map((p) => ({ ...p, quoteId: created.id })),
        });
      }

      if (laborItems && laborItems.length > 0) {
        await tx.quoteLabor.createMany({
          data: laborItems.map((l) => ({ ...l, quoteId: created.id })),
        });
      }

      return created;
    });

    revalidatePath("/quotes");
    return quote;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES }] });
}

export async function updateQuote(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = updateQuoteSchema.parse(input);
    const existing = await db.quote.findFirst({
      where: { id: data.id, organizationId },
    });
    if (!existing) throw new Error("Quote not found");

    const { id, partItems, laborItems, ...quoteData } = data;

    const quote = await db.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...quoteData,
          validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
          discountType: quoteData.discountType === "none" ? null : quoteData.discountType,
        },
      });

      if (partItems !== undefined) {
        await tx.quotePart.deleteMany({ where: { quoteId: id } });
        if (partItems.length > 0) {
          await tx.quotePart.createMany({
            data: partItems.map((p) => ({ ...p, quoteId: id })),
          });
        }
      }

      if (laborItems !== undefined) {
        await tx.quoteLabor.deleteMany({ where: { quoteId: id } });
        if (laborItems.length > 0) {
          await tx.quoteLabor.createMany({
            data: laborItems.map((l) => ({ ...l, quoteId: id })),
          });
        }
      }

      return updated;
    });

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${id}`);
    return quote;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}

export async function updateQuoteStatus(quoteId: string, status: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (!quote) throw new Error("Quote not found");

    await db.quote.updateMany({
      where: { id: quoteId, organizationId },
      data: { status },
    });

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quoteId}`);
    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }] });
}

export async function deleteQuote(quoteId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
    });
    if (!quote) throw new Error("Quote not found");

    await db.quote.deleteMany({ where: { id: quoteId, organizationId } });
    revalidatePath("/quotes");
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.QUOTES }] });
}

export async function convertQuoteToServiceRecord(quoteId: string, vehicleId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const quote = await db.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { partItems: true, laborItems: true },
    });
    if (!quote) throw new Error("Quote not found");

    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    // Get settings for invoice number
    const [settings, org] = await Promise.all([
      db.appSetting.findMany({
        where: { organizationId, key: { in: ["workshop.invoicePrefix"] } },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;
    const prefix = resolveInvoicePrefix(settingsMap["workshop.invoicePrefix"] || "{year}-");

    const lastRecord = await db.serviceRecord.findFirst({
      where: { vehicle: { organizationId } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });
    let nextNum = 1001;
    if (lastRecord?.invoiceNumber) {
      const match = lastRecord.invoiceNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const invoiceNumber = `${prefix}${nextNum}`;

    const record = await db.$transaction(async (tx) => {
      const created = await tx.serviceRecord.create({
        data: {
          title: quote.title,
          description: quote.description,
          type: "repair",
          status: "pending",
          vehicleId,
          shopName: org?.name || undefined,
          invoiceNumber,
          subtotal: quote.subtotal,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          totalAmount: quote.totalAmount,
          cost: quote.totalAmount,
          discountType: quote.discountType,
          discountValue: quote.discountValue,
          discountAmount: quote.discountAmount,
          serviceDate: new Date(),
        },
      });

      if (quote.partItems.length > 0) {
        await tx.servicePart.createMany({
          data: quote.partItems.map((p) => ({
            partNumber: p.partNumber,
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            total: p.total,
            serviceRecordId: created.id,
          })),
        });
      }

      if (quote.laborItems.length > 0) {
        await tx.serviceLabor.createMany({
          data: quote.laborItems.map((l) => ({
            description: l.description,
            hours: l.hours,
            rate: l.rate,
            total: l.total,
            serviceRecordId: created.id,
          })),
        });
      }

      // Mark quote as converted
      await tx.quote.updateMany({
        where: { id: quoteId, organizationId },
        data: { status: "converted", convertedToId: created.id },
      });

      return created;
    });

    revalidatePath("/quotes");
    revalidatePath("/work-orders");
    revalidatePath(`/vehicles/${vehicleId}`);
    return record;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES }] });
}
