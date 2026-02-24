"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
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

    if (!customer) throw new Error("Customer not found");
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
    const customer = await db.customer.create({
      data: {
        ...data,
        email: data.email || null,
        userId,
        organizationId,
      },
    });
    revalidatePath("/customers");
    return customer;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS }] });
}

export async function updateCustomer(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const { id, ...data } = updateCustomerSchema.parse(input);
    const result = await db.customer.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        email: data.email || null,
      },
    });
    if (result.count === 0) throw new Error("Customer not found");
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { id };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }] });
}

export async function deleteCustomer(customerId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const result = await db.customer.deleteMany({ where: { id: customerId, organizationId } });
    if (result.count === 0) throw new Error("Customer not found");
    revalidatePath("/customers");
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS }] });
}

export async function getCustomersPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  return withAuth(async ({ userId, organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { email: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
        { company: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: {
          _count: { select: { vehicles: true } },
        },
        orderBy: { updatedAt: "desc" },
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

export async function getCustomersList() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.customer.findMany({
      where: { organizationId },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}
