"use server";

import { db } from "@/lib/db";
import { getCustomerSession, type CustomerSessionData } from "@/lib/customer-session";
import { notify } from "@/lib/notify";
import { withAuth, type ActionResult } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

type PortalResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function withPortalAuth<T>(
  action: (session: CustomerSessionData) => Promise<T>,
): Promise<PortalResult<T>> {
  try {
    const session = await getCustomerSession();

    if (!session) {
      return { success: false, error: "Not authenticated" };
    }

    const data = await action(session);
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[portalAction]", message);
    return { success: false, error: message };
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export async function getPortalDashboard() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const [customer, vehicles, recentInvoices, recentQuotes, pendingRequests] =
      await Promise.all([
        db.customer.findUnique({
          where: { id: customerId },
          select: { name: true, email: true },
        }),
        db.vehicle.findMany({
          where: { customerId, organizationId },
          select: { id: true },
        }),
        db.serviceRecord.findMany({
          where: {
            vehicle: { customerId, organizationId },
          },
          select: {
            id: true,
            title: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            serviceDate: true,
            publicToken: true,
            vehicle: { select: { make: true, model: true } },
          },
          orderBy: { serviceDate: "desc" },
          take: 5,
        }),
        db.quote.findMany({
          where: { customerId, organizationId },
          select: {
            id: true,
            title: true,
            quoteNumber: true,
            status: true,
            totalAmount: true,
            validUntil: true,
            publicToken: true,
            vehicle: { select: { make: true, model: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        db.serviceRequest.findMany({
          where: { customerId, organizationId, status: "pending" },
          select: {
            id: true,
            description: true,
            preferredDate: true,
            status: true,
            createdAt: true,
            vehicle: { select: { make: true, model: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // Count open invoices (not fully paid)
    const allInvoices = await db.serviceRecord.findMany({
      where: { vehicle: { customerId, organizationId } },
      select: {
        totalAmount: true,
        manuallyPaid: true,
        payments: { select: { amount: true } },
      },
    });

    const openInvoiceCount = allInvoices.filter((inv) => {
      if (inv.manuallyPaid) return false;
      const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
      return paid < inv.totalAmount;
    }).length;

    const pendingQuoteCount = await db.quote.count({
      where: { customerId, organizationId, status: "sent" },
    });

    return {
      customer,
      vehicleCount: vehicles.length,
      openInvoiceCount,
      pendingQuoteCount,
      recentInvoices,
      recentQuotes,
      pendingRequests,
    };
  });
}

// ─── Vehicles ─────────────────────────────────────────────────────────────

export async function getPortalVehicles() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const vehicles = await db.vehicle.findMany({
      where: { customerId, organizationId, isArchived: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        color: true,
        imageUrl: true,
        _count: {
          select: {
            serviceRecords: true,
            inspections: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return vehicles;
  });
}

export async function getPortalVehicleDetail(vehicleId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, customerId, organizationId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        licensePlate: true,
        color: true,
        mileage: true,
        fuelType: true,
        transmission: true,
        imageUrl: true,
        serviceRecords: {
          select: {
            id: true,
            title: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            serviceDate: true,
            publicToken: true,
          },
          orderBy: { serviceDate: "desc" },
        },
        inspections: {
          select: {
            id: true,
            status: true,
            completedAt: true,
            publicToken: true,
            createdAt: true,
            template: { select: { name: true } },
            items: { select: { condition: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    return vehicle;
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export async function getPortalInvoices() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const invoices = await db.serviceRecord.findMany({
      where: {
        vehicle: { customerId, organizationId },
      },
      select: {
        id: true,
        title: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        serviceDate: true,
        publicToken: true,
        manuallyPaid: true,
        vehicle: { select: { make: true, model: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { serviceDate: "desc" },
    });
    return invoices;
  });
}

// ─── Quotes ───────────────────────────────────────────────────────────────

export async function getPortalQuotes() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const quotes = await db.quote.findMany({
      where: { customerId, organizationId },
      select: {
        id: true,
        title: true,
        quoteNumber: true,
        status: true,
        totalAmount: true,
        validUntil: true,
        publicToken: true,
        vehicle: { select: { make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return quotes;
  });
}

// ─── Inspections ──────────────────────────────────────────────────────────

export async function getPortalInspections() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const inspections = await db.inspection.findMany({
      where: {
        vehicle: { customerId, organizationId },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        publicToken: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true, licensePlate: true } },
        template: { select: { name: true } },
        items: { select: { condition: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return inspections;
  });
}

// ─── Service Requests ─────────────────────────────────────────────────────

export async function createServiceRequest(input: {
  vehicleId: string;
  description: string;
  preferredDate?: string;
}) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    // Validate vehicle belongs to customer
    const vehicle = await db.vehicle.findFirst({
      where: { id: input.vehicleId, customerId, organizationId },
      select: { id: true, make: true, model: true },
    });

    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });

    const serviceRequest = await db.serviceRequest.create({
      data: {
        description: input.description,
        preferredDate: input.preferredDate
          ? new Date(input.preferredDate)
          : null,
        customerId,
        vehicleId: input.vehicleId,
        organizationId,
      },
    });

    // Notify staff
    const vehicleName = `${vehicle.make} ${vehicle.model}`;
    const customerName = customer?.name ?? "A customer";

    await notify({
      organizationId,
      type: "service_request",
      title: "New Service Request",
      message: `${customerName} requested service for ${vehicleName}: ${input.description.slice(0, 100)}`,
      entityType: "service_request",
      entityId: serviceRequest.id,
      entityUrl: `/customers/${customerId}?tab=requests`,
    });

    return serviceRequest;
  });
}

export async function getPortalServiceRequests() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const requests = await db.serviceRequest.findMany({
      where: { customerId, organizationId },
      select: {
        id: true,
        description: true,
        preferredDate: true,
        status: true,
        adminNotes: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return requests;
  });
}

// ─── Admin: Portal Slug ──────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{1,46}[a-z0-9]$/;
const RESERVED_SLUGS = ["auth", "api", "admin", "login", "verify", "dashboard", "settings", "portal"];

export async function updatePortalSlug(
  slug: string | null,
): Promise<ActionResult> {
  return withAuth(
    async ({ organizationId }) => {
      // Allow clearing the slug
      if (!slug || slug.trim() === "") {
        await db.organization.update({
          where: { id: organizationId },
          data: { portalSlug: null },
        });
        revalidatePath("/settings/customer-portal");
        return null;
      }

      const normalized = slug.trim().toLowerCase();

      if (!SLUG_REGEX.test(normalized)) {
        throw new Error(
          "Slug must be 3–48 characters, lowercase alphanumeric, hyphens, or underscores.",
        );
      }

      if (RESERVED_SLUGS.includes(normalized)) {
        throw new Error("This slug is reserved. Please choose another.");
      }

      // Check uniqueness
      const existing = await db.organization.findUnique({
        where: { portalSlug: normalized },
        select: { id: true },
      });

      if (existing && existing.id !== organizationId) {
        throw new Error("This slug is already taken. Please choose another.");
      }

      await db.organization.update({
        where: { id: organizationId },
        data: { portalSlug: normalized },
      });

      revalidatePath("/settings/customer-portal");
      return null;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
