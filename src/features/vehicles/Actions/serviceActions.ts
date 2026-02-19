"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createServiceSchema, updateServiceSchema } from "../Schema/serviceSchema";
import { revalidatePath } from "next/cache";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getServiceRecords(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    return db.serviceRecord.findMany({
      where: { vehicleId },
      include: {
        _count: { select: { partItems: true, laborItems: true } },
      },
      orderBy: { serviceDate: "desc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}

export async function getServiceRecordsPaginated(
  vehicleId: string,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
  }
) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { vehicleId };

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { diagnosticNotes: { contains: params.search, mode: "insensitive" } },
        { techName: { contains: params.search, mode: "insensitive" } },
        { shopName: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.type && params.type !== "all") {
      where.type = params.type;
    }

    const [records, total] = await Promise.all([
      db.serviceRecord.findMany({
        where,
        include: {
          _count: { select: { partItems: true, laborItems: true, attachments: true } },
          laborItems: { take: 1, select: { description: true } },
        },
        orderBy: { serviceDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.serviceRecord.count({ where }),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}

export async function getAllServiceRecords() {
  return withAuth(async ({ organizationId }) => {
    return db.serviceRecord.findMany({
      where: { vehicle: { organizationId } },
      include: {
        vehicle: { select: { make: true, model: true, year: true } },
        _count: { select: { partItems: true, laborItems: true } },
      },
      orderBy: { serviceDate: "desc" },
      take: 50,
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}

export async function getAllServiceRecordsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  status?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { vehicle: { organizationId } };

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { techName: { contains: params.search, mode: "insensitive" } },
        { vehicle: { make: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { model: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { licensePlate: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.type && params.type !== "all") {
      where.type = params.type;
    }

    if (params.status && params.status !== "all") {
      where.status = params.status;
    }

    const [records, total] = await Promise.all([
      db.serviceRecord.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { serviceDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.serviceRecord.count({ where }),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}

export async function getServiceRecord(recordId: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: recordId, vehicle: { organizationId } },
      include: {
        partItems: true,
        laborItems: true,
        attachments: true,
        payments: { orderBy: { date: "desc" } },
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            licensePlate: true,
            mileage: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                company: true,
              },
            },
          },
        },
      },
    });

    return record;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}

export async function createServiceRecord(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createServiceSchema.parse(input);
    const vehicle = await db.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    // Auto-populate shop name and invoice prefix from settings
    const [settings, org] = await Promise.all([
      db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: ["workshop.invoicePrefix", "workshop.invoiceStartNumber"] },
        },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    const shopName = data.shopName || org?.name || undefined;
    const prefix = resolveInvoicePrefix(settingsMap["workshop.invoicePrefix"] || "{year}-");

    // Generate sequential invoice number
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
    const invoiceNumber = `${prefix}${nextNum}`;

    // Clear start number after first use so it doesn't override future increments
    if (startNumber && nextNum === startNumber) {
      await db.appSetting.updateMany({
        where: { organizationId, key: "workshop.invoiceStartNumber" },
        data: { value: "" },
      });
    }

    const { partItems, laborItems, attachments, ...recordData } = data;

    const record = await db.$transaction(async (tx) => {
      const created = await tx.serviceRecord.create({
        data: {
          ...recordData,
          shopName,
          invoiceNumber,
          serviceDate: new Date(recordData.serviceDate),
        },
      });

      if (partItems && partItems.length > 0) {
        await tx.servicePart.createMany({
          data: partItems.map((p) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { inventoryPartId: _inv, ...partData } = p;
            return { ...partData, serviceRecordId: created.id };
          }),
        });

        // Deduct inventory stock for parts sourced from inventory
        for (const p of partItems) {
          if (p.inventoryPartId) {
            const invPart = await tx.inventoryPart.findFirst({
              where: { id: p.inventoryPartId, organizationId },
            });
            if (invPart) {
              const newQty = invPart.quantity - Math.ceil(p.quantity);
              await tx.inventoryPart.update({
                where: { id: p.inventoryPartId },
                data: { quantity: Math.max(0, newQty) },
              });
            }
          }
        }
      }

      if (laborItems && laborItems.length > 0) {
        await tx.serviceLabor.createMany({
          data: laborItems.map((l) => ({
            ...l,
            serviceRecordId: created.id,
          })),
        });
      }

      if (attachments && attachments.length > 0) {
        await tx.serviceAttachment.createMany({
          data: attachments.map((a) => ({
            ...a,
            serviceRecordId: created.id,
          })),
        });
      }

      return created;
    });

    // Revalidate inventory if any parts were sourced from inventory
    const hasInventoryParts = partItems?.some((p) => p.inventoryPartId);
    if (hasInventoryParts) {
      revalidatePath("/inventory");
    }

    // Update vehicle mileage if service mileage is higher, and reset maintenance dismissed
    const vehicleUpdate: { mileage?: number; maintenanceDismissed: boolean; maintenanceDismissedAt: null } = {
      maintenanceDismissed: false,
      maintenanceDismissedAt: null,
    };
    if (data.mileage && data.mileage > vehicle.mileage) {
      vehicleUpdate.mileage = data.mileage;
    }
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: vehicleUpdate,
    });

    revalidatePath("/");
    revalidatePath(`/vehicles/${data.vehicleId}`);
    revalidatePath("/services");
    return record;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES }] });
}

export async function updateServiceRecord(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = updateServiceSchema.parse(input);
    const existing = await db.serviceRecord.findFirst({
      where: { id: data.id, vehicle: { organizationId } },
      include: { attachments: { select: { fileUrl: true, category: true } } },
    });
    if (!existing) throw new Error("Service record not found");

    const { id, partItems, laborItems, attachments, ...recordData } = data;

    // Determine which categories are being replaced and which files were removed
    let removedFileUrls: string[] = [];
    let categoriesToReplace: string[] = [];
    if (attachments !== undefined) {
      categoriesToReplace = [...new Set(attachments.map((a) => a.category || "diagnostic"))];
      const existingInCategories = existing.attachments.filter((a) =>
        categoriesToReplace.includes(a.category)
      );
      const newFileUrls = new Set(attachments.map((a) => a.fileUrl));
      removedFileUrls = existingInCategories
        .map((a) => a.fileUrl)
        .filter((url) => !newFileUrls.has(url));
    }

    const record = await db.$transaction(async (tx) => {
      const updated = await tx.serviceRecord.update({
        where: { id },
        data: {
          ...recordData,
          serviceDate: recordData.serviceDate ? new Date(recordData.serviceDate) : undefined,
        },
      });

      // Replace parts if provided
      if (partItems !== undefined) {
        await tx.servicePart.deleteMany({ where: { serviceRecordId: id } });
        if (partItems.length > 0) {
          await tx.servicePart.createMany({
            data: partItems.map((p) => ({
              ...p,
              serviceRecordId: id,
            })),
          });
        }
      }

      // Replace labor if provided
      if (laborItems !== undefined) {
        await tx.serviceLabor.deleteMany({ where: { serviceRecordId: id } });
        if (laborItems.length > 0) {
          await tx.serviceLabor.createMany({
            data: laborItems.map((l) => ({
              ...l,
              serviceRecordId: id,
            })),
          });
        }
      }

      // Replace attachments if provided (only for the categories included in the payload)
      if (attachments !== undefined) {
        if (categoriesToReplace.length > 0) {
          await tx.serviceAttachment.deleteMany({
            where: { serviceRecordId: id, category: { in: categoriesToReplace } },
          });
        }
        if (attachments.length > 0) {
          await tx.serviceAttachment.createMany({
            data: attachments.map((a) => ({
              ...a,
              serviceRecordId: id,
            })),
          });
        }
      }

      return updated;
    });

    // Delete removed attachment files from disk (after successful DB transaction)
    for (const fileUrl of removedFileUrls) {
      try {
        await unlink(resolveUploadPath(fileUrl));
      } catch (err) {
        console.warn(`[updateServiceRecord] Failed to delete file "${fileUrl}":`, err);
      }
    }

    revalidatePath("/");
    revalidatePath(`/vehicles/${existing.vehicleId}`);
    revalidatePath(`/vehicles/${existing.vehicleId}/service/${id}`);
    revalidatePath("/services");
    return record;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}

export async function updateServiceStatus(recordId: string, status: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: recordId, vehicle: { organizationId } },
    });
    if (!record) throw new Error("Record not found");

    await db.serviceRecord.update({
      where: { id: recordId },
      data: { status },
    });

    revalidatePath("/");
    revalidatePath("/work-orders");
    revalidatePath("/services");
    revalidatePath(`/vehicles/${record.vehicleId}`);
    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}

export async function toggleManuallyPaid(recordId: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: recordId, vehicle: { organizationId } },
    });
    if (!record) throw new Error("Record not found");

    await db.serviceRecord.update({
      where: { id: recordId },
      data: { manuallyPaid: !record.manuallyPaid },
    });

    revalidatePath("/");
    revalidatePath("/services");
    revalidatePath(`/vehicles/${record.vehicleId}`);
    revalidatePath(`/vehicles/${record.vehicleId}/service/${recordId}`);
    return { success: true, manuallyPaid: !record.manuallyPaid };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}

export async function getWorkOrders(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { vehicle: { organizationId } };

    if (params.status === "active") {
      where.status = { not: "completed" };
    } else if (params.status && params.status !== "all") {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { techName: { contains: params.search, mode: "insensitive" } },
        { vehicle: { licensePlate: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { customer: { name: { contains: params.search, mode: "insensitive" } } } },
      ];
    }

    const [records, total, statusCounts] = await Promise.all([
      db.serviceRecord.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { serviceDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.serviceRecord.count({ where }),
      db.serviceRecord.groupBy({
        by: ["status"],
        where: { vehicle: { organizationId } },
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
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS }] });
}

export async function deleteServiceRecord(recordId: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: recordId, vehicle: { organizationId } },
      include: { attachments: true },
    });
    if (!record) throw new Error("Record not found");

    // Clean up attachment files from disk
    for (const attachment of record.attachments) {
      const filePath = resolveUploadPath(attachment.fileUrl);
      try {
        await unlink(filePath);
      } catch (err) {
        console.warn(`[deleteServiceRecord] Failed to delete file "${filePath}":`, err);
      }
    }

    await db.serviceRecord.delete({ where: { id: recordId } });
    revalidatePath("/");
    revalidatePath(`/vehicles/${record.vehicleId}`);
    revalidatePath("/services");
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES }] });
}

export async function deleteServiceAttachment(attachmentId: string) {
  return withAuth(async ({ organizationId }) => {
    const attachment = await db.serviceAttachment.findFirst({
      where: { id: attachmentId, serviceRecord: { vehicle: { organizationId } } },
      include: { serviceRecord: { select: { vehicleId: true, id: true } } },
    });
    if (!attachment) throw new Error("Attachment not found");

    // Delete file from disk
    const filePath = resolveUploadPath(attachment.fileUrl);
    try {
      await unlink(filePath);
    } catch (err) {
      console.warn(`[deleteServiceAttachment] Failed to delete file "${filePath}":`, err);
    }

    await db.serviceAttachment.delete({ where: { id: attachmentId } });

    const { vehicleId, id: serviceId } = attachment.serviceRecord;
    revalidatePath(`/vehicles/${vehicleId}/service/${serviceId}`);
    return { deleted: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}

export async function generatePublicLink(serviceRecordId: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: serviceRecordId, vehicle: { organizationId } },
    });
    if (!record) throw new Error("Record not found");

    const token = randomUUID();
    await db.serviceRecord.update({
      where: { id: serviceRecordId },
      data: { publicToken: token },
    });

    revalidatePath(`/vehicles/${record.vehicleId}/service/${serviceRecordId}`);
    return { token, organizationId };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}

export async function revokePublicLink(serviceRecordId: string) {
  return withAuth(async ({ organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: { id: serviceRecordId, vehicle: { organizationId } },
    });
    if (!record) throw new Error("Record not found");

    await db.serviceRecord.update({
      where: { id: serviceRecordId },
      data: { publicToken: null },
    });

    revalidatePath(`/vehicles/${record.vehicleId}/service/${serviceRecordId}`);
    return { revoked: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }] });
}
