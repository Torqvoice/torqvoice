"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD local date
  time: string | null; // HH:MM or null
  type: "service" | "reminder" | "quote";
  status: string;
  vehicleId: string;
  vehicleLabel: string;
  customerName: string | null;
  invoiceNumber: string | null;
  amount: number | null;
};

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function getCalendarEvents(params: {
  start: string;
  end: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = new Date(params.start);
    const end = new Date(params.end);
    end.setHours(23, 59, 59, 999);

    const [services, reminders, quotes] = await Promise.all([
      db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          serviceDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          title: true,
          serviceDate: true,
          status: true,
          invoiceNumber: true,
          totalAmount: true,
          cost: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { serviceDate: "asc" },
      }),
      db.reminder.findMany({
        where: {
          vehicle: { organizationId },
          dueDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          isCompleted: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      db.quote.findMany({
        where: {
          organizationId,
          validUntil: { gte: start, lte: end },
          status: { notIn: ["converted", "rejected"] },
        },
        select: {
          id: true,
          title: true,
          quoteNumber: true,
          validUntil: true,
          status: true,
          totalAmount: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
          customer: { select: { name: true } },
        },
        orderBy: { validUntil: "asc" },
      }),
    ]);

    const events: CalendarEvent[] = [
      ...services.map((s) => ({
        id: s.id,
        title: s.title,
        date: toLocalDateStr(s.serviceDate),
        time: toTimeStr(s.serviceDate),
        type: "service" as const,
        status: s.status,
        vehicleId: s.vehicleId,
        vehicleLabel: `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}`,
        customerName: s.vehicle.customer?.name ?? null,
        invoiceNumber: s.invoiceNumber,
        amount: s.totalAmount > 0 ? s.totalAmount : s.cost > 0 ? s.cost : null,
      })),
      ...reminders
        .filter((r) => r.dueDate !== null)
        .map((r) => ({
          id: r.id,
          title: r.title,
          date: toLocalDateStr(r.dueDate!),
          time: null,
          type: "reminder" as const,
          status: r.isCompleted ? "completed" : new Date(r.dueDate!) < new Date() ? "overdue" : "upcoming",
          vehicleId: r.vehicleId,
          vehicleLabel: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
          customerName: r.vehicle.customer?.name ?? null,
          invoiceNumber: null,
          amount: null,
        })),
      ...quotes
        .filter((q) => q.validUntil !== null && q.vehicleId !== null)
        .map((q) => ({
          id: q.id,
          title: q.title,
          date: toLocalDateStr(q.validUntil!),
          time: null,
          type: "quote" as const,
          status: q.status,
          vehicleId: q.vehicleId!,
          vehicleLabel: q.vehicle ? `${q.vehicle.year} ${q.vehicle.make} ${q.vehicle.model}` : "",
          customerName: q.customer?.name ?? q.vehicle?.customer?.name ?? null,
          invoiceNumber: q.quoteNumber,
          amount: q.totalAmount > 0 ? q.totalAmount : null,
        })),
    ];

    return events;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}
