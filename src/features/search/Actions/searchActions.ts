"use server";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getRecentCustomers() {
  return withAuth(async ({ organizationId }) => {
    const customers = await db.customer.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return customers;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD }] });
}

export async function globalSearch(query: string) {
  return withAuth(async ({ organizationId }) => {
    if (!query || query.trim().length < 2) {
      return { vehicles: [], customers: [], services: [], parts: [], quotes: [] };
    }

    const q = query.trim();
    const mode = "insensitive" as Prisma.QueryMode;

    const vehicleOr: Prisma.VehicleWhereInput[] = [
      { make: { contains: q, mode } },
      { model: { contains: q, mode } },
      { licensePlate: { contains: q, mode } },
      { vin: { contains: q, mode } },
    ];
    if (!isNaN(Number(q))) {
      vehicleOr.push({ year: Number(q) });
    }

    const [vehicles, customers, services, parts, quotes] = await Promise.all([
      db.vehicle.findMany({
        where: { organizationId, OR: vehicleOr },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
        },
        take: 10,
      }),
      db.customer.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: q, mode } },
            { email: { contains: q, mode } },
            { phone: { contains: q, mode } },
            { company: { contains: q, mode } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
        },
        take: 10,
      }),
      db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          OR: [
            { title: { contains: q, mode } },
            { invoiceNumber: { contains: q, mode } },
            { techName: { contains: q, mode } },
          ],
        },
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
        },
        take: 10,
      }),
      db.inventoryPart.findMany({
        where: {
          organizationId,
          isArchived: false,
          OR: [
            { name: { contains: q, mode } },
            { partNumber: { contains: q, mode } },
            { supplier: { contains: q, mode } },
          ],
        },
        select: {
          id: true,
          name: true,
          partNumber: true,
          quantity: true,
        },
        take: 10,
      }),
      db.quote.findMany({
        where: {
          organizationId,
          OR: [
            { title: { contains: q, mode } },
            { quoteNumber: { contains: q, mode } },
            { customer: { name: { contains: q, mode } } },
          ],
        },
        select: {
          id: true,
          title: true,
          quoteNumber: true,
          status: true,
        },
        take: 10,
      }),
    ]);

    return { vehicles, customers, services, parts, quotes };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD }] });
}
