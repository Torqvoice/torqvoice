"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createCustomerSchema, updateCustomerSchema } from "../Schema/customerSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getFeatures, FeatureGatedError } from "@/lib/features";

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

export async function getCustomersList() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.customer.findMany({
      where: { organizationId },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS }] });
}
