"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { z } from "zod";
import { createCustomerSchema, updateCustomerSchema } from "../Schema/customerSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getFeatures, FeatureGatedError } from "@/lib/features";
import { createDraftServiceRecord } from "@/features/vehicles/Actions/createDraftServiceRecord";

export async function getCustomers() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.customer.findMany({
      where: { organizationId },
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}

export async function getCustomer(customerId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId },
      include: {
        vehicles: {
          where: { isArchived: false },
          include: {
            _count: { select: { serviceRecords: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
        serviceRequests: {
          include: {
            vehicle: { select: { id: true, make: true, model: true, year: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Missing or foreign-org customer yields null rather than an error: the
    // page renders its not-found state, and this also runs during the
    // post-delete re-render of the customer route.
    return customer;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}

export async function createCustomer(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const features = await getFeatures(organizationId);
    const count = await db.customer.count({ where: { organizationId } });
    if (count >= features.maxCustomers) {
      throw new FeatureGatedError("maxCustomers", "Customer limit reached. Upgrade your plan to add more customers.");
    }

    const data = createCustomerSchema.parse(input);

    // Auto-assign the next sequential number when none was provided; the
    // per-org unique index guards against races and manual duplicates.
    let customerNumber = data.customerNumber?.trim() || null;
    if (!customerNumber) {
      const existing = await db.customer.findMany({
        where: { organizationId, customerNumber: { not: null } },
        select: { customerNumber: true },
      });
      const max = existing.reduce((acc, c) => {
        const n = Number.parseInt(c.customerNumber ?? "", 10);
        return Number.isFinite(n) && n > acc ? n : acc;
      }, 1000);
      customerNumber = String(max + 1);
    }

    try {
      const customer = await db.customer.create({
        data: {
          ...data,
          customerNumber,
          email: data.email || null,
          userId,
          organizationId,
        },
      });
      revalidatePath("/customers");
      return customer;
    } catch (err: unknown) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new Error("Customer number is already in use");
      }
      throw err;
    }
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS }],
    audit: ({ result }) => ({
      action: "customer.create",
      entity: "Customer",
      entityId: result.id,
      message: `Created customer ${result.name}`,
      metadata: { customerId: result.id },
    }),
  });
}

export async function updateCustomer(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const { id, ...data } = updateCustomerSchema.parse(input);
    let result;
    try {
      result = await db.customer.updateMany({
        where: { id, organizationId },
        data: {
          ...data,
          customerNumber:
            data.customerNumber !== undefined
              ? data.customerNumber.trim() || null
              : undefined,
          email: data.email || null,
          company: data.company || null,
          phone: data.phone || null,
          address: data.address || null,
        },
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new Error("Customer number is already in use");
      }
      throw err;
    }
    if (result.count === 0) throw new Error("Customer not found");
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { id };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }],
    audit: ({ result }) => ({
      action: "customer.update",
      entity: "Customer",
      entityId: result.id,
      message: `Updated customer ${result.id}`,
      metadata: { customerId: result.id },
    }),
  });
}

export async function deleteCustomer(customerId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const result = await db.customer.deleteMany({ where: { id: customerId, organizationId } });
    if (result.count === 0) throw new Error("Customer not found");
    revalidatePath("/customers");
    return { customerId };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS }],
    audit: ({ result }) => ({
      action: "customer.delete",
      entity: "Customer",
      entityId: result.customerId,
      message: `Deleted customer ${result.customerId}`,
      metadata: { customerId: result.customerId },
    }),
  });
}

export async function deleteCustomers(customerIds: string[]) {
  return withAuth(async ({ userId, organizationId }) => {
    if (customerIds.length === 0) throw new Error("No customers selected");
    const result = await db.customer.deleteMany({
      where: { id: { in: customerIds }, organizationId },
    });
    revalidatePath("/customers");
    return { deleted: result.count };
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS }] });
}

/**
 * Assigns sequential numbers to every customer that has none, oldest first,
 * continuing after the highest existing numeric number (min 1001). Customers
 * that already have a number — auto or manual — are never touched.
 */
export async function backfillCustomerNumbers() {
  return withAuth(async ({ organizationId }) => {
    const [numbered, unnumbered] = await Promise.all([
      db.customer.findMany({
        where: { organizationId, customerNumber: { not: null } },
        select: { customerNumber: true },
      }),
      db.customer.findMany({
        where: { organizationId, customerNumber: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    let next = numbered.reduce((acc, c) => {
      const n = Number.parseInt(c.customerNumber ?? "", 10);
      return Number.isFinite(n) && n > acc ? n : acc;
    }, 1000) + 1;

    await db.$transaction(
      unnumbered.map((c) =>
        db.customer.update({
          where: { id: c.id },
          data: { customerNumber: String(next++) },
        })
      )
    );

    revalidatePath("/customers");
    revalidatePath("/settings/invoice");
    return { assigned: unnumbered.length };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }],
    audit: ({ result }) => ({
      action: "customer.backfillNumbers",
      entity: "Customer",
      message: `Assigned customer numbers to ${result.assigned} customers`,
      metadata: { assigned: result.assigned },
    }),
  });
}

export async function getCustomersPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return withAuth(async ({ userId, organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };

    if (params.search) {
      const words = params.search.trim().split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        where.AND = words.map((word: string) => ({
          OR: [
            { name: { contains: word, mode: "insensitive" } },
            { email: { contains: word, mode: "insensitive" } },
            { phone: { contains: word, mode: "insensitive" } },
            { company: { contains: word, mode: "insensitive" } },
            { customerNumber: { contains: word, mode: "insensitive" } },
          ],
        }));
      } else {
        where.OR = [
          { name: { contains: params.search, mode: "insensitive" } },
          { email: { contains: params.search, mode: "insensitive" } },
          { phone: { contains: params.search, mode: "insensitive" } },
          { company: { contains: params.search, mode: "insensitive" } },
          { customerNumber: { contains: params.search, mode: "insensitive" } },
        ];
      }
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: {
          _count: { select: { vehicles: true } },
        },
        orderBy: (() => {
          const dir = params.sortOrder || "desc";
          const nullable = { sort: dir, nulls: "last" } as const;
          switch (params.sortBy) {
            case "number": return { customerNumber: { sort: dir, nulls: "last" as const } };
            case "name": return { name: dir };
            case "company": return { company: nullable };
            case "phone": return { phone: nullable };
            case "email": return { email: nullable };
            case "vehicles": return { vehicles: { _count: dir } };
            default: return { updatedAt: "desc" as const };
          }
        })(),
        skip,
        take: pageSize,
      }),
      db.customer.count({ where }),
    ]);

    return {
      customers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}

export async function updateServiceRequest(
  requestId: string,
  data: { status?: string; adminNotes?: string },
) {
  return withAuth(async ({ userId, organizationId }) => {
    const result = await db.serviceRequest.updateMany({
      where: { id: requestId, organizationId },
      data,
    });
    if (result.count === 0) throw new Error("Service request not found");
    revalidatePath("/customers");
    return { id: requestId };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }] });
}

export async function createWorkOrderFromRequest(requestId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const request = await db.serviceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: { vehicle: { select: { id: true } } },
    });
    if (!request) throw new Error("Service request not found");
    if (request.status === "converted") throw new Error("Work order already created for this request");

    const vehicleId = request.vehicleId;
    const serviceDate = request.preferredDate ?? undefined;

    const result = await createDraftServiceRecord(vehicleId, serviceDate);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Failed to create work order");
    }
    const record = result.data;

    const truncatedTitle = request.description.length > 60
      ? request.description.slice(0, 57) + "..."
      : request.description;

    await db.serviceRecord.update({
      where: { id: record.id },
      data: {
        title: truncatedTitle,
        description: request.description,
      },
    });

    const existingNotes = request.adminNotes ? `${request.adminNotes}\n` : "";
    await db.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: "converted",
        adminNotes: `${existingNotes}Work Order: ${record.id}`,
      },
    });

    revalidatePath("/customers");
    return { vehicleId, serviceRecordId: record.id };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }] });
}

const importCustomerRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional(),
});

export async function checkDuplicateCustomers(
  rows: { name: string; email?: string; phone?: string }[]
) {
  return withAuth(async ({ organizationId }) => {
    const existing = await db.customer.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, phone: true, company: true, address: true },
    });

    const duplicates: Record<number, { id: string; name: string; matchedOn: string; isExact: boolean }> = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const ex of existing) {
        // Match by email (non-empty)
        if (row.email && ex.email && row.email.toLowerCase() === ex.email.toLowerCase()) {
          const isExact = ex.name.toLowerCase() === row.name.toLowerCase()
            && (ex.phone || "") === (row.phone || "");
          duplicates[i] = { id: ex.id, name: ex.name, matchedOn: "email", isExact };
          break;
        }
        // Match by phone (non-empty)
        if (row.phone && ex.phone && row.phone.replace(/\D/g, "") === ex.phone.replace(/\D/g, "")) {
          const isExact = ex.name.toLowerCase() === row.name.toLowerCase()
            && (ex.email || "").toLowerCase() === (row.email || "").toLowerCase();
          duplicates[i] = { id: ex.id, name: ex.name, matchedOn: "phone", isExact };
          break;
        }
        // Match by name (case-insensitive)
        if (ex.name.toLowerCase() === row.name.toLowerCase()) {
          const isExact = (ex.email || "").toLowerCase() === (row.email || "").toLowerCase()
            && (ex.phone || "") === (row.phone || "");
          duplicates[i] = { id: ex.id, name: ex.name, matchedOn: "name", isExact };
          break;
        }
      }
    }

    return duplicates;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}

export async function importCustomers(
  rows: { name: string; email?: string; phone?: string; company?: string; address?: string }[],
  mergeMap?: Record<number, string>, // rowIndex → existing customer ID to update
) {
  return withAuth(async ({ userId, organizationId }) => {
    const features = await getFeatures(organizationId);
    const currentCount = await db.customer.count({ where: { organizationId } });

    type ValidRow = { name: string; email: string | null; phone: string | null; company: string | null; address: string | null };
    const toCreate: ValidRow[] = [];
    const toMerge: { id: string; data: ValidRow }[] = [];
    const errors: { row: number; error: string }[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const result = importCustomerRowSchema.safeParse(rows[i]);
      if (!result.success) {
        errors.push({ row: i + 1, error: result.error.issues[0]?.message || "Invalid data" });
        continue;
      }

      const parsed: ValidRow = {
        name: result.data.name,
        email: result.data.email || null,
        phone: result.data.phone || null,
        company: result.data.company || null,
        address: result.data.address || null,
      };

      const mergeId = mergeMap?.[i];
      if (mergeId === "__skip__") {
        skipped++;
      } else if (mergeId) {
        toMerge.push({ id: mergeId, data: parsed });
      } else {
        toCreate.push(parsed);
      }
    }

    const remaining = features.maxCustomers - currentCount;
    if (toCreate.length > remaining) {
      throw new FeatureGatedError(
        "maxCustomers",
        `Customer limit reached. You can import ${remaining} more customer(s). Upgrade your plan for more.`
      );
    }

    if (toCreate.length > 0) {
      await db.customer.createMany({
        data: toCreate.map((c) => ({ ...c, userId, organizationId })),
      });
    }

    let merged = 0;
    for (const { id, data } of toMerge) {
      const res = await db.customer.updateMany({
        where: { id, organizationId },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          address: data.address,
        },
      });
      if (res.count > 0) merged++;
    }

    revalidatePath("/customers");
    return { imported: toCreate.length, merged, skipped, errors };
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS }] });
}

export async function getCustomersList() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.customer.findMany({
      where: { organizationId },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}

export async function searchCustomers(search?: string, limit = 20, offset = 0) {
  return withAuth(async ({ organizationId }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        // Every word must match in at least one field
        where.AND = words.map((word) => ({
          OR: [
            { name: { contains: word, mode: "insensitive" } },
            { email: { contains: word, mode: "insensitive" } },
            { phone: { contains: word, mode: "insensitive" } },
            { company: { contains: word, mode: "insensitive" } },
            { customerNumber: { contains: word, mode: "insensitive" } },
          ],
        }));
      } else {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ];
      }
    }
    return db.customer.findMany({
      where,
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
      skip: offset,
      take: limit,
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}
